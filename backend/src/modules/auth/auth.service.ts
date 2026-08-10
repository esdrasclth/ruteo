import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { CredentialsService } from './credentials.service';
import { LoginThrottleService } from './login-throttle.service';
import { nombreDeUsuario, ZitadelService } from './zitadel/zitadel.service';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Huella del refresh token que se guarda en `User.refreshTokenHash`.
 *
 * **SHA-256 y no bcrypt, y no es una cuestión de rendimiento.** bcrypt trunca
 * su entrada a 72 bytes. Un refresh token es un JWT de ~270 bytes cuyos
 * primeros 72 son la cabecera más el arranque del `sub`: IDÉNTICOS entre dos
 * tokens del mismo usuario. Con bcrypt, comparar el token viejo contra el hash
 * del nuevo devolvía `true` —comprobado—, así que la rotación no invalidaba
 * nada y un refresh robado seguía sirviendo sus 7 días completos.
 *
 * El token es un JWT firmado con 256 bits de entropía, no una contraseña que
 * alguien pueda adivinar: no necesita factor de trabajo, necesita no truncarse.
 */
function huellaDeRefresh(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparación en tiempo constante de dos huellas hex. */
function huellasIguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  // `timingSafeEqual` lanza si los largos difieren, y esa excepción sería en sí
  // misma un canal lateral. Un largo distinto ya significa que no coinciden.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly zitadel: ZitadelService,
    private readonly credenciales: CredentialsService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async register(dto: RegisterDto): Promise<Tokens> {
    // Pre-generate the tenant id so we can set the RLS context BEFORE inserting
    // the tenant row. This makes both the INSERT and its RETURNING (which is
    // evaluated against the SELECT policy) satisfy `id = current_tenant_id()`.
    const tenantId = randomUUID();

    // El alta ocurre PRIMERO en ZITADEL. Si falla, no se ha escrito nada local
    // y se puede reintentar sin dejar basura. El orden inverso —crear el tenant
    // y luego el usuario remoto— dejaría tenants sin nadie que pueda entrar,
    // que es peor de limpiar que una cuenta huérfana en ZITADEL.
    const externalId = await this.zitadel.crearUsuario({
      loginName: nombreDeUsuario(dto.slug, dto.email),
      email: dto.email.toLowerCase(),
      password: dto.password,
      nombre: dto.tenantName,
    });

    let user: { id: string; role: Role };
    try {
      user = await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.tenant.create({
          data: { id: tenantId, name: dto.tenantName, slug: dto.slug },
        });
        return tx.user.create({
          data: {
            tenantId,
            email: dto.email.toLowerCase(),
            externalId,
            role: Role.OWNER,
          },
          select: { id: true, role: true },
        });
      });
    } catch (error) {
      // Compensación: el usuario ya existe en ZITADEL pero el tenant local no
      // se pudo crear. Sin esto queda una cuenta huérfana que, por ser el
      // nombre único en toda la instancia, impediría reintentar el registro con
      // el mismo slug y correo.
      await this.zitadel.borrarUsuario(externalId).catch(() => undefined);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Tenant slug already in use');
      }
      throw error;
    }

    // El correo del alta se manda sin bloquear el registro: si el envío falla,
    // la cuenta ya existe y se puede reintentar desde el panel. Cortar el alta
    // por un fallo de correo dejaría al usuario sin cuenta y sin poder repetir
    // (el nombre ya estaría cogido en ZITADEL).
    void this.credenciales
      .enviarVerificacion(tenantId, user.id, dto.email.toLowerCase())
      .catch((e) =>
        // Se traga el fallo para no tumbar el alta, pero se REGISTRA: tragarlo
        // en silencio deja "no me llegó el correo" sin forma de investigarse.
        this.log.error(
          `No se pudo enviar la verificación del alta (${dto.slug}): ${String(e)}`,
        ),
      );

    return this.issueTokens(tenantId, user.id, user.role);
  }

  async login(dto: LoginDto): Promise<Tokens> {
    // El bloqueo se comprueba ANTES de resolver el tenant y para cualquier
    // identificador, exista o no: si solo se bloquearan las cuentas reales, el
    // mensaje delataría cuáles lo son.
    await this.throttle.comprobar(dto.slug, dto.email);

    const tenantId = await this.tenants.resolveIdBySlug(dto.slug);
    if (!tenantId) {
      await this.throttle.registrarFallo(dto.slug, dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { tenantId_email: { tenantId, email: dto.email.toLowerCase() } },
        select: { id: true, role: true, status: true },
      }),
    );

    // La fila local manda sobre quién existe y con qué rol; ZITADEL solo dice
    // si la credencial es correcta.
    if (!user) {
      await this.throttle.registrarFallo(dto.slug, dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      await this.zitadel.verificarCredenciales(
        nombreDeUsuario(dto.slug, dto.email),
        dto.password,
      );
    } catch (e) {
      // Solo cuentan los fallos de CREDENCIAL. Si ZITADEL está caído
      // (`ServiceUnavailable`), sumarlo bloquearía a usuarios legítimos por una
      // avería que no es suya.
      if (e instanceof UnauthorizedException) {
        await this.throttle.registrarFallo(dto.slug, dto.email);
      }
      throw e;
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is disabled');
    }

    await this.throttle.limpiar(dto.slug, dto.email);
    return this.issueTokens(tenantId, user.id, user.role);
  }

  async refresh(
    tenantId: string,
    userId: string,
    presentedToken: string,
  ): Promise<Tokens> {
    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, status: true, refreshTokenHash: true },
      }),
    );
    if (
      !user?.refreshTokenHash ||
      !huellasIguales(huellaDeRefresh(presentedToken), user.refreshTokenHash)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is disabled');
    }
    return this.issueTokens(tenantId, user.id, user.role);
  }

  async logout(tenantId: string, userId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
      }),
    );
  }

  private async issueTokens(
    tenantId: string,
    userId: string,
    role: Role,
  ): Promise<Tokens> {
    const payload: JwtPayload = { sub: userId, tid: tenantId, role };

    type ExpiresIn = JwtSignOptions['expiresIn'];
    const accessOpts: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TTL') as ExpiresIn,
    };
    const refreshOpts: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_TTL') as ExpiresIn,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, accessOpts),
      this.jwt.signAsync(payload, refreshOpts),
    ]);

    const refreshTokenHash = huellaDeRefresh(refreshToken);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.update({ where: { id: userId }, data: { refreshTokenHash } }),
    );

    return { accessToken, refreshToken };
  }
}
