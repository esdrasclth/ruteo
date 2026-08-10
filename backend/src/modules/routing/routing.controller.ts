import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TenantModule } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { RoutingService } from './routing.service';

@ApiTags('routing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('routing')
// Solo sirve para dibujar la geometría de una ruta, así que sigue al módulo de
// rutas: sin él no hay ruta que dibujar.
@Modulo(TenantModule.ROUTES)
// Los mismos que pueden ver una ruta. Un comercio o un cliente final no tienen
// nada que hacer aquí, y cada llamada mueve el motor OSRM.
@Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  // Devuelve `null` en el cuerpo cuando no hay geometría posible (menos de dos
  // paradas con coordenadas, u OSRM apagado). El panel lo trata como "dibuja
  // líneas rectas", no como un error.
  @Get('route/:id')
  forRoute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routing.forRoute(user.tenantId, id);
  }
}
