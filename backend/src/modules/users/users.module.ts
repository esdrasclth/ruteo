import { Module } from '@nestjs/common';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ZitadelService } from '../auth/zitadel/zitadel.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, ZitadelService, VerifiedEmailGuard],
  exports: [UsersService],
})
export class UsersModule {}
