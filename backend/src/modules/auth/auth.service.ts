import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<Tokens> {
    // Pre-generate the tenant id so we can set the RLS context BEFORE inserting
    // the tenant row. This makes both the INSERT and its RETURNING (which is
    // evaluated against the SELECT policy) satisfy `id = current_tenant_id()`.
    const tenantId = randomUUID();
    const passwordHash = await bcrypt.hash(dto.password, 12);

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
            passwordHash,
            role: Role.OWNER,
          },
          select: { id: true, role: true },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Tenant slug already in use');
      }
      throw error;
    }

    return this.issueTokens(tenantId, user.id, user.role);
  }

  async login(dto: LoginDto): Promise<Tokens> {
    const tenantId = await this.tenants.resolveIdBySlug(dto.slug);
    if (!tenantId) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { tenantId_email: { tenantId, email: dto.email.toLowerCase() } },
        select: { id: true, role: true, status: true, passwordHash: true },
      }),
    );
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is disabled');
    }

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
      !(await bcrypt.compare(presentedToken, user.refreshTokenHash))
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

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.update({ where: { id: userId }, data: { refreshTokenHash } }),
    );

    return { accessToken, refreshToken };
  }
}
