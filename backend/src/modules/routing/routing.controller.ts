import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RoutingService } from './routing.service';

@ApiTags('routing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('routing')
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
