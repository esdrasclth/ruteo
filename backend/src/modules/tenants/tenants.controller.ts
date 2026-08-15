import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CualquierRol, Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

/**
 * La ficha de la propia empresa: contacto y datos de facturación.
 *
 * Sin `@Modulo`: esto no es una función que se contrate, es el expediente de la
 * empresa. Colgarlo de un módulo dejaría a un plan sin poder rellenar los datos
 * que hacen falta justamente para contratar otro plan.
 */
@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  // Lo puede leer cualquiera con sesión: el panel muestra el nombre de la
  // empresa y su plan en la cabecera, y eso lo ve hasta un repartidor.
  //
  // Hay que DECLARARLO: `RolesGuard` deniega por defecto, así que la intención
  // escrita aquí arriba no bastaba —el handler respondía 403 a todo el mundo,
  // incluido el OWNER, y la tarjeta de datos fiscales de Facturación salía
  // vacía sin decir por qué—.
  @Get('me')
  @CualquierRol()
  perfil(@CurrentUser() user: AuthUser) {
    return this.tenants.perfil(user.tenantId);
  }

  // Escribir, no. El RTN y la dirección fiscal salen en las facturas: es
  // información de la empresa, no de la operación diaria.
  @Patch('me')
  @Roles(Role.OWNER, Role.ADMIN)
  actualizar(@CurrentUser() user: AuthUser, @Body() dto: UpdateTenantDto) {
    return this.tenants.actualizarPerfil(user.tenantId, dto);
  }
}
