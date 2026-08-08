import { Module } from '@nestjs/common';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { AuditModule } from '../audit/audit.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [AuditModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, VerifiedEmailGuard],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
