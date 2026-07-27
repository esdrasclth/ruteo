import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  // Búsqueda global del panel: resuelve envíos, clientes, casilleros, rutas y
  // repartidores en una sola llamada para el buscador de comandos.
  @Get()
  @ApiQuery({ name: 'q', required: true, example: 'RUT-2SXM' })
  find(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    return this.search.search(user.tenantId, q);
  }
}
