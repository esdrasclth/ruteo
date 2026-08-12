import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import { urlDeTenant } from '../../common/tenant-host';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_PROVIDER } from '../notifications/notification-provider';
import type { NotificationProvider } from '../notifications/notification-provider';

/**
 * Avisa de que una prueba está por vencer, antes de que venza.
 *
 * Sin esto la prueba se acababa en silencio: la empresa entraba un martes y le
 * faltaban módulos, sin haber recibido una sola advertencia. Y del lado de casa
 * nadie sabía a quién llamar antes de perder la venta.
 *
 * **Se avisa una vez.** La marca `trialWarnedAt` es lo que lo hace idempotente:
 * el trabajo corre cada doce horas y, sin ella, una prueba a tres días de vencer
 * mandaría seis correos. Un aviso repetido no avisa mejor; entrena a la gente a
 * ignorarlos.
 */

/** Con cuántos días de antelación se avisa. */
const DIAS_DE_ANTELACION = 3;

interface PruebaPorAvisar {
  tenantId: string;
  nombre: string;
  slug: string;
  plan: string;
  finDePeriodo: Date;
  email: string | null;
}

@Injectable()
export class AvisosPruebaService {
  private readonly log = new Logger(AvisosPruebaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notificador: NotificationProvider,
  ) {}

  /** Devuelve cuántos avisos se mandaron. */
  async avisarPruebasPorVencer(): Promise<number> {
    const pendientes = await this.buscarPendientes();
    let enviados = 0;

    for (const prueba of pendientes) {
      // Una empresa sin correo de facturación y sin OWNER activo no es
      // avisable. Se marca igual para no volver a intentarlo cada doce horas, y
      // se REGISTRA: es un caso raro que conviene poder investigar.
      if (!prueba.email) {
        this.log.warn(
          `Prueba de ${prueba.slug} sin destinatario al que avisar; se marca para no reintentar`,
        );
        await this.marcarAvisada(prueba.tenantId);
        continue;
      }

      const ok = await this.enviar(prueba);
      // Se marca pase lo que pase con el envío. Reintentar en bucle un correo
      // que rebota —dirección inválida— mandaría un intento cada doce horas
      // hasta que la prueba caduque, y el resultado sería el mismo.
      await this.marcarAvisada(prueba.tenantId);
      if (ok) enviados += 1;
    }

    if (enviados > 0) {
      this.log.log(`Avisadas ${enviados} pruebas por vencer`);
    }
    return enviados;
  }

  private async buscarPendientes(): Promise<PruebaPorAvisar[]> {
    const filas = await this.prisma.$queryRaw<
      {
        out_tenant_id: string;
        out_tenant_name: string;
        out_slug: string;
        out_plan: string;
        out_period_end: Date;
        out_email: string | null;
      }[]
    >`SELECT * FROM pruebas_por_avisar(${DIAS_DE_ANTELACION})`;

    return filas.map((f) => ({
      tenantId: f.out_tenant_id,
      nombre: f.out_tenant_name,
      slug: f.out_slug,
      plan: f.out_plan,
      finDePeriodo: f.out_period_end,
      email: f.out_email,
    }));
  }

  /**
   * Marca la prueba como avisada.
   *
   * Va con el contexto del tenant puesto, o sea pasando por RLS como cualquier
   * otra escritura. La función SECURITY DEFINER solo LEE: darle además permiso
   * de escritura sería ampliar lo que concede sin necesidad.
   */
  private async marcarAvisada(tenantId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.update({
        where: { tenantId },
        data: { trialWarnedAt: new Date() },
      }),
    );
  }

  private async enviar(prueba: PruebaPorAvisar): Promise<boolean> {
    const dias = Math.max(
      1,
      Math.ceil(
        (prueba.finDePeriodo.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      ),
    );

    const panel = urlDeTenant(
      this.config.get<string>('PANEL_TENANT_URL') ??
        'http://{slug}.localhost:3001',
      prueba.slug,
    ).replace(/\/+$/, '');

    const titulo = `Tu prueba del plan ${prueba.plan} termina en ${dias} día${dias === 1 ? '' : 's'}`;
    // El tono importa: esto no es un corte de servicio. Lo que hay que dejar
    // clarísimo es que NO se pierde nada, porque el miedo a perder los datos es
    // lo que hace que la gente no conteste.
    const cuerpo =
      `Hola,

` +
      `La prueba del plan ${prueba.plan} de ${prueba.nombre} termina en ` +
      `${dias} día${dias === 1 ? '' : 's'}.

` +
      `Si no hacemos nada, tu cuenta pasa al plan Free. **No se pierde nada**: ` +
      `tus envíos, clientes y rutas siguen ahí; solo dejan de estar disponibles ` +
      `las funciones del plan de prueba.

` +
      `Si quieres seguir con ${prueba.plan}, respóndenos a este correo y lo ` +
      `activamos. Ten a mano tus datos de facturación —razón social, RTN, ` +
      `dirección— que puedes dejar cargados aquí:
${panel}/billing

` +
      `Gracias por probar Ruteo.`;

    const res = await this.notificador.send({
      channel: NotificationChannel.EMAIL,
      recipient: prueba.email!,
      title: titulo,
      body: cuerpo,
    });

    // Queda registro como cualquier otro aviso, para que «no me llegó» se pueda
    // investigar. Aquí el cuerpo SÍ se guarda: no lleva ningún secreto dentro,
    // al revés que los correos de credenciales.
    await this.prisma.withTenant(prueba.tenantId, (tx) =>
      tx.notification.create({
        data: {
          tenantId: prueba.tenantId,
          channel: NotificationChannel.EMAIL,
          recipient: prueba.email!,
          type: 'trial.expiring',
          title: titulo,
          body: cuerpo,
          status: res.ok ? 'SENT' : 'FAILED',
          provider: this.notificador.name,
          error: res.error ?? null,
          sentAt: res.ok ? new Date() : null,
        },
      }),
    );

    if (!res.ok) {
      this.log.error(
        `No se pudo avisar a ${prueba.slug} de su prueba: ${res.error}`,
      );
    }
    return res.ok;
  }
}
