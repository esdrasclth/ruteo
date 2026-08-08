import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { LoginThrottleService } from '../auth/login-throttle.service';
import { ZitadelService } from '../auth/zitadel/zitadel.service';
import { PlatformPrismaService } from './platform-prisma.service';

// Prefijo del nombre de usuario en ZITADEL. Los de tenant son `{slug}:{correo}`,
// así que este espacio no puede colisionar con ninguna empresa: no existe un
// slug llamado "plataforma" porque el registro no permite los dos puntos.
const PREFIJO = 'plataforma';

export interface PlatformJwtPayload {
  sub: string;
  email: string;
  /// Marca explícita. El guard de plataforma la exige y el de tenant la
  /// rechaza: así un token no puede servir en el lado equivocado ni por
  /// descuido ni por confusión de secretos.
  scope: 'platform';
}

@Injectable()
export class PlatformAuthService {
  private readonly log = new Logger(PlatformAuthService.name);

  constructor(
    private readonly db: PlatformPrismaService,
    private readonly zitadel: ZitadelService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly throttle: LoginThrottleService,
  ) {}

  static nombreDeUsuario(email: string) {
    return `${PREFIJO}:${email.toLowerCase()}`;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    await this.throttle.comprobar(PREFIJO, email);

    const admin = await this.db.platformAdmin.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Igual que en el login de tenant: la fila local decide quién existe,
    // ZITADEL solo dice si la credencial es correcta.
    if (!admin || admin.status !== UserStatus.ACTIVE) {
      await this.throttle.registrarFallo(PREFIJO, email);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    try {
      await this.zitadel.verificarCredenciales(
        PlatformAuthService.nombreDeUsuario(email),
        password,
      );
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        await this.throttle.registrarFallo(PREFIJO, email);
      }
      throw e;
    }

    await this.throttle.limpiar(PREFIJO, email);
    await this.db.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    // Se registra SIEMPRE, con éxito incluido: cada entrada al panel que puede
    // ver todas las empresas debe quedar anotada.
    this.log.warn(`[plataforma] entró ${admin.email}`);

    const payload: PlatformJwtPayload = {
      sub: admin.id,
      email: admin.email,
      scope: 'platform',
    };
    const opts: JwtSignOptions = {
      secret: this.secreto(),
      // Vida corta a propósito: es el token más peligroso del sistema y no hay
      // refresh. Que caduque obliga a volver a pasar por credenciales.
      expiresIn: '30m',
    };
    return { accessToken: await this.jwt.signAsync(payload, opts) };
  }

  async verificarToken(token: string): Promise<PlatformJwtPayload> {
    let payload: PlatformJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<PlatformJwtPayload>(token, {
        secret: this.secreto(),
      });
    } catch {
      throw new UnauthorizedException('Sesión de plataforma inválida');
    }

    if (payload.scope !== 'platform') {
      throw new UnauthorizedException('Sesión de plataforma inválida');
    }

    // Se comprueba la fila en cada petición y no solo al firmar: si a un
    // superadmin se le retira el acceso, no debe seguir entrando durante lo que
    // le quede de token.
    const admin = await this.db.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (!admin || admin.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Sesión de plataforma inválida');
    }
    return payload;
  }

  private secreto(): string {
    // Secreto PROPIO, distinto del de los tokens de tenant. Con uno compartido,
    // quien pudiera falsificar un token de empresa falsificaría también uno de
    // plataforma.
    return this.config.getOrThrow<string>('PLATFORM_JWT_SECRET');
  }
}
