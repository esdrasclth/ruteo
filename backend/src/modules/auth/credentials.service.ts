import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialTokenType, NotificationChannel } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_PROVIDER } from '../notifications/notification-provider';
import type { NotificationProvider } from '../notifications/notification-provider';
import { TenantsService } from '../tenants/tenants.service';
import { ZitadelService } from './zitadel/zitadel.service';
import { Inject } from '@nestjs/common';

// Restablecimiento de contraseña y verificación de correo.
//
// **Los códigos los custodia Ruteo, no ZITADEL, y no es una preferencia.**
// Comprobado contra la instancia el 2026-08-08: llamando a
// `POST /v2/users/{id}/password` con el token de la cuenta de servicio, ZITADEL
// **no valida** `verification.verificationCode`. Se le puede fijar la contraseña
// a cualquier usuario con un código inventado, sin haber pedido restablecimiento
// —probado, y la contraseña cambia de verdad—. Reenviarle el código que teclea
// el usuario habría dejado que cualquiera restableciera la de cualquiera.
//
// Así que el código se genera aquí, se guarda hasheado, y se valida aquí. A
// ZITADEL solo se le pide fijar la contraseña una vez comprobado.

const VIGENCIA_MIN = 30;
// Seis dígitos es lo que la gente puede teclear desde el móvil sin equivocarse.
// Lo que lo hace seguro no es la longitud sino la vigencia corta, el uso único y
// el límite de intentos.
const LARGO_CODIGO = 6;
const INTENTOS_MAX = 5;

@Injectable()
export class CredentialsService {
  private readonly log = new Logger(CredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly zitadel: ZitadelService,
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notificador: NotificationProvider,
  ) {}

  /**
   * Arranca el restablecimiento. **Siempre responde igual**, exista o no la
   * cuenta: si distinguiera, este endpoint sería un verificador de qué correos
   * están dados de alta en cada empresa.
   */
  async solicitarRestablecimiento(slug: string, email: string): Promise<void> {
    const usuario = await this.buscarUsuario(slug, email);
    if (!usuario) {
      this.log.log(
        `Restablecimiento pedido para un correo sin cuenta (${slug})`,
      );
      return;
    }

    // **Recuperar la cuenta exige el correo probado.** Si alguien se registró
    // con la dirección mal escrita, mandar ahí el código entrega la cuenta a
    // quien tenga esa bandeja. Es el agujero clásico de "recuperación sobre
    // correo no verificado".
    //
    // Aun así se manda un correo —sin código—: mantiene la respuesta 202
    // indistinguible del caso normal y, si la dirección sí es del titular, le
    // dice exactamente qué hacer en vez de dejarlo esperando algo que no llega.
    if (!usuario.emailVerified) {
      this.log.warn(
        `Restablecimiento bloqueado por correo sin verificar (${slug})`,
      );
      await this.enviar(
        usuario.tenantId,
        email,
        'No podemos restablecer tu contraseña todavía',
        'Pediste restablecer la contraseña de tu cuenta de Ruteo, pero este ' +
          'correo aún no está verificado y no podemos enviar un código de ' +
          'recuperación a una dirección sin confirmar. Entra con tu contraseña ' +
          'actual y verifica el correo desde el panel; después podrás ' +
          'restablecerla cuando lo necesites.',
      );
      return;
    }

    const codigo = this.generarCodigo();
    await this.guardarCodigo(
      usuario.tenantId,
      usuario.id,
      CredentialTokenType.PASSWORD_RESET,
      codigo,
    );

    await this.enviar(
      usuario.tenantId,
      email,
      'Restablecer tu contraseña de Ruteo',
      `Tu código para restablecer la contraseña es ${codigo}. ` +
        `Caduca en ${VIGENCIA_MIN} minutos. Si no lo pediste tú, ignora este mensaje.`,
    );
  }

  /** Consume el código y fija la nueva contraseña en ZITADEL. */
  async restablecer(
    slug: string,
    email: string,
    codigo: string,
    nueva: string,
  ): Promise<void> {
    const usuario = await this.buscarUsuario(slug, email);
    // El correo sin verificar se rechaza igual que un código malo: no se
    // confirma si la cuenta existe ni por qué falla. Nunca debería llegarse
    // aquí —sin verificar no se emite código—, pero si alguien apunta directo
    // al endpoint, el control tiene que estar en los dos sitios.
    if (!usuario?.externalId || !usuario.emailVerified) {
      throw new BadRequestException('Código inválido o caducado');
    }

    await this.consumirCodigo(
      usuario.tenantId,
      usuario.id,
      CredentialTokenType.PASSWORD_RESET,
      codigo,
    );

    await this.zitadel.establecerContrasena(usuario.externalId, nueva);

    // Cualquier sesión viva deja de servir: si alguien restablece porque le
    // robaron la cuenta, dejar el refresh del intruso en pie no arregla nada.
    await this.prisma.withTenant(usuario.tenantId, (tx) =>
      tx.user.update({
        where: { id: usuario.id },
        data: { refreshTokenHash: null },
      }),
    );
  }

  /** Manda el código de verificación al correo del usuario indicado. */
  async reenviarVerificacion(tenantId: string, userId: string): Promise<void> {
    const usuario = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({ where: { id: userId }, select: { email: true } }),
    );
    if (!usuario) return;
    await this.enviarVerificacion(tenantId, userId, usuario.email);
  }

  /** Manda la invitación a un miembro del equipo recién dado de alta. */
  async enviarInvitacion(
    tenantId: string,
    userId: string,
    email: string,
  ): Promise<void> {
    const codigo = this.generarCodigo();
    await this.guardarCodigo(
      tenantId,
      userId,
      CredentialTokenType.INVITATION,
      codigo,
    );

    const panel = (
      this.config.get<string>('PANEL_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
    const slug = await this.slugDe(tenantId);
    const enlace =
      `${panel}/accept-invitation?slug=${encodeURIComponent(slug)}` +
      `&email=${encodeURIComponent(email)}&code=${encodeURIComponent(codigo)}`;

    await this.enviar(
      tenantId,
      email,
      `Te invitaron a Ruteo (${slug})`,
      `Te dieron de alta en Ruteo para la empresa ${slug}.

` +
        `Elige tu contraseña aquí:
${enlace}

` +
        `O entra en ${panel}/accept-invitation y usa el código ${codigo}.

` +
        `Caduca en ${VIGENCIA_MIN} minutos. Nadie más conoce esta contraseña: ` +
        `la eliges tú.`,
    );
  }

  /**
   * El invitado fija su contraseña y entra por primera vez.
   *
   * Aceptar la invitación deja el correo por verificado: el código llegó a esa
   * bandeja y solo quien la abre pudo traerlo, que es exactamente lo que la
   * verificación demuestra. Pedirle después que verifique sería repetir la
   * misma prueba.
   */
  async aceptarInvitacion(
    slug: string,
    email: string,
    codigo: string,
    contrasena: string,
  ): Promise<void> {
    const usuario = await this.buscarUsuario(slug, email);
    if (!usuario?.externalId) {
      throw new BadRequestException('Invitación inválida o caducada');
    }

    try {
      await this.consumirCodigo(
        usuario.tenantId,
        usuario.id,
        CredentialTokenType.INVITATION,
        codigo,
      );
    } catch {
      throw new BadRequestException('Invitación inválida o caducada');
    }

    await this.zitadel.establecerContrasena(usuario.externalId, contrasena);
    await this.zitadel.marcarCorreoVerificado(usuario.externalId, email);
    await this.prisma.withTenant(usuario.tenantId, (tx) =>
      tx.user.update({
        where: { id: usuario.id },
        data: { emailVerified: true },
      }),
    );
  }

  /** Verifica el correo sin sesión, con los datos que viajan en el enlace. */
  async verificarCorreoPublico(
    slug: string,
    email: string,
    codigo: string,
  ): Promise<void> {
    const usuario = await this.buscarUsuario(slug, email);
    // Mismo error que un código malo: no se confirma si la cuenta existe.
    if (!usuario) throw new BadRequestException('Código inválido o caducado');
    await this.verificarCorreo(usuario.tenantId, usuario.id, codigo);
  }

  /** Manda (o remanda) el código de verificación del correo. */
  async enviarVerificacion(
    tenantId: string,
    userId: string,
    email: string,
  ): Promise<void> {
    const codigo = this.generarCodigo();
    await this.guardarCodigo(
      tenantId,
      userId,
      CredentialTokenType.EMAIL_VERIFICATION,
      codigo,
    );
    // El correo lleva el código Y un enlace que lo trae ya escrito. El enlace
    // es para quien abre el correo en el móvil y solo quiere pulsar; el código
    // suelto es para quien lee el correo en un sitio y trabaja en otro, y para
    // cuando el cliente de correo rompe los enlaces largos.
    const panel = (
      this.config.get<string>('PANEL_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
    const slug = await this.slugDe(tenantId);
    const enlace =
      `${panel}/verify-email?slug=${encodeURIComponent(slug)}` +
      `&email=${encodeURIComponent(email)}&code=${encodeURIComponent(codigo)}`;

    await this.enviar(
      tenantId,
      email,
      'Verifica tu correo en Ruteo',
      `Tu código de verificación es ${codigo}.

` +
        `También puedes verificarlo de un clic aquí:
${enlace}

` +
        `Caduca en ${VIGENCIA_MIN} minutos.`,
    );
  }

  /** Marca el correo como verificado en ZITADEL tras comprobar el código. */
  async verificarCorreo(
    tenantId: string,
    userId: string,
    codigo: string,
  ): Promise<void> {
    await this.consumirCodigo(
      tenantId,
      userId,
      CredentialTokenType.EMAIL_VERIFICATION,
      codigo,
    );

    const usuario = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: { externalId: true, email: true },
      }),
    );
    if (usuario?.externalId) {
      await this.zitadel.marcarCorreoVerificado(
        usuario.externalId,
        usuario.email,
      );
    }

    // El espejo local se actualiza DESPUÉS de que ZITADEL lo confirme: al revés
    // el panel diría "verificado" con el proveedor sin enterarse.
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.update({ where: { id: userId }, data: { emailVerified: true } }),
    );
  }

  // --- interno ---------------------------------------------------------------

  private generarCodigo(): string {
    // `randomInt` del módulo crypto, no `Math.random`: un código de acceso
    // predecible no es un código.
    let s = '';
    for (let i = 0; i < LARGO_CODIGO; i++) s += randomInt(0, 10).toString();
    return s;
  }

  private async slugDe(tenantId: string): Promise<string> {
    const t = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    );
    return t?.slug ?? '';
  }

  private async buscarUsuario(slug: string, email: string) {
    const tenantId = await this.tenants.resolveIdBySlug(slug);
    if (!tenantId) return null;

    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
        select: { id: true, externalId: true, emailVerified: true },
      }),
    );
    return user ? { ...user, tenantId } : null;
  }

  private async guardarCodigo(
    tenantId: string,
    userId: string,
    type: CredentialTokenType,
    codigo: string,
  ): Promise<void> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      // Los códigos anteriores del mismo tipo se invalidan: pedir uno nuevo
      // tiene que dejar sin valor al viejo, o cada solicitud amplía la ventana
      // de ataque en vez de renovarla.
      await tx.credentialToken.deleteMany({ where: { userId, type } });
      await tx.credentialToken.create({
        data: {
          tenantId,
          userId,
          type,
          codeHash: await bcrypt.hash(codigo, 10),
          expiresAt: new Date(Date.now() + VIGENCIA_MIN * 60_000),
        },
      });
    });
  }

  private async consumirCodigo(
    tenantId: string,
    userId: string,
    type: CredentialTokenType,
    codigo: string,
  ): Promise<void> {
    const vigente = await this.prisma.withTenant(tenantId, (tx) =>
      tx.credentialToken.findFirst({
        where: { userId, type, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    );

    if (!vigente) {
      throw new BadRequestException('Código inválido o caducado');
    }

    // Tope de intentos. Seis dígitos son un millón de combinaciones y la vigencia
    // es de 30 minutos: sin este tope, un script las recorre. Al pasarse, el
    // código se quema y hay que pedir otro —que además llega al correo del
    // titular, así que el ataque deja rastro donde el dueño lo ve.
    if (vigente.attempts >= INTENTOS_MAX) {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.credentialToken.deleteMany({ where: { userId, type } }),
      );
      throw new BadRequestException('Código inválido o caducado');
    }

    if (!(await bcrypt.compare(codigo, vigente.codeHash))) {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.credentialToken.update({
          where: { id: vigente.id },
          data: { attempts: { increment: 1 } },
        }),
      );
      throw new BadRequestException('Código inválido o caducado');
    }

    // Se borra en vez de marcarse: un solo uso, y no deja el hash rondando.
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.credentialToken.deleteMany({ where: { userId, type } }),
    );
  }

  private async enviar(
    tenantId: string,
    destinatario: string,
    titulo: string,
    cuerpo: string,
  ): Promise<void> {
    const res = await this.notificador.send({
      channel: NotificationChannel.EMAIL,
      recipient: destinatario,
      title: titulo,
      body: cuerpo,
    });

    // Queda registro del envío igual que cualquier otra notificación, para que
    // "no me llegó el correo" se pueda investigar.
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.notification.create({
        data: {
          tenantId,
          channel: NotificationChannel.EMAIL,
          recipient: destinatario,
          type: 'credential',
          title: titulo,
          // El cuerpo NO se guarda: lleva el código dentro, y la tabla de
          // notificaciones la puede leer cualquier operador del panel.
          body: '[código omitido]',
          status: res.ok ? 'SENT' : 'FAILED',
          provider: this.notificador.name,
          error: res.error ?? null,
          sentAt: res.ok ? new Date() : null,
        },
      }),
    );

    if (!res.ok) {
      this.log.error(`No se pudo enviar el correo de credencial: ${res.error}`);
    }
  }
}
