import { TenantModule } from '@prisma/client';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { RequiereCorreoVerificado } from '../../common/decorators/verified-email.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedEmailGuard, TenantAccessGuard)
@Roles(Role.OWNER, Role.ADMIN)
@Controller('api-keys')
@Modulo(TenantModule.INTEGRATIONS)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  // Una llave de API es una credencial con acceso a los envíos del tenant.
  // Emitirla desde una cuenta cuyo correo nadie ha probado es regalar ese
  // acceso a quien pueda estar detrás de una dirección equivocada.
  @Post()
  @RequiereCorreoVerificado()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.apiKeys.list(user.tenantId);
  }

  @Delete(':id')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.apiKeys.revoke(user, id);
  }
}
