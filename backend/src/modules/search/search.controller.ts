import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, TenantModule } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ModulosActivos } from '../../common/decorators/modulos-activos.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
// El buscador global devuelve clientes con teléfono y correo, envíos con
// destinatario y repartidores. Estaba con `RolesGuard` pero SIN `@Roles`, y ese
// guard deja pasar a todo el mundo cuando no hay roles declarados: un DRIVER
// —o un CUSTOMER— listaba la agenda entera de la empresa.
//
// Se limita a los perfiles de oficina, que son para quienes se hizo el
// buscador de comandos. Un repartidor trabaja sobre sus paradas, no sobre la
// base de clientes.
@Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  // Búsqueda global del panel: resuelve envíos, clientes, casilleros, rutas y
  // repartidores en una sola llamada para el buscador de comandos.
  //
  // No lleva `@Modulo` porque cruza cinco de ellos y en todos los planes tiene
  // sentido buscar. Lo que sí respeta el plan son las SECCIONES: hasta ahora
  // devolvía casilleros y rutas a empresas que no los tienen contratados, y
  // cada resultado era un enlace a una pantalla que les responde 403.
  @Get()
  @ApiQuery({ name: 'q', required: true, example: 'RUT-2SXM' })
  find(
    @CurrentUser() user: AuthUser,
    @ModulosActivos() modulos: TenantModule[] | undefined,
    @Query('q') q = '',
  ) {
    return this.search.search(user.tenantId, q, modulos);
  }
}
