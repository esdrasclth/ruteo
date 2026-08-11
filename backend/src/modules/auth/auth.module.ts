import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { CredentialsService } from './credentials.service';
import { LoginThrottleService } from './login-throttle.service';
import { SessionHandoffService } from './session-handoff.service';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ZitadelService } from './zitadel/zitadel.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    TenantsModule,
    NotificationsModule,
  ],
  controllers: [AuthController],
  exports: [CredentialsService],
  providers: [
    AuthService,
    CredentialsService,
    LoginThrottleService,
    SessionHandoffService,
    PublicRateLimitGuard,
    JwtStrategy,
    JwtRefreshStrategy,
    ZitadelService,
  ],
})
export class AuthModule {}
