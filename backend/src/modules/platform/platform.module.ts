import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { LoginThrottleService } from '../auth/login-throttle.service';
import { ZitadelService } from '../auth/zitadel/zitadel.service';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformController } from './platform.controller';
import { PlatformPrismaService } from './platform-prisma.service';
import { PlatformService } from './platform.service';

/**
 * Gestión de la plataforma.
 *
 * `PlatformPrismaService` —la conexión sin RLS— se declara aquí y NO se
 * exporta: ningún otro módulo puede inyectarla. Es lo que mantiene acotada la
 * única superficie del sistema que ve datos de todas las empresas.
 */
@Module({
  imports: [JwtModule.register({}), AuthModule],
  controllers: [PlatformController],
  providers: [
    PlatformPrismaService,
    PlatformService,
    PlatformAuthService,
    PlatformAuthGuard,
    PublicRateLimitGuard,
    ZitadelService,
    LoginThrottleService,
  ],
})
export class PlatformModule {}
