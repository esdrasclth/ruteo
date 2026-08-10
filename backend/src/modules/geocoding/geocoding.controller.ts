import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { GeocodingService } from './geocoding.service';

@ApiTags('geocoding')
@ApiBearerAuth()
// Con sesión y con tope: el buscador dispara una consulta por pausa de tecleo, y
// Nominatim prohíbe el uso masivo. Sin este límite un solo usuario impaciente
// podría hacer que nos bloqueen el servicio a todos los tenants.
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard, TenantAccessGuard)
@RateLimit(30, 60)
// El tope es POR IDENTIDAD, así que sin restringir el rol cada cuenta traía su
// propio cupo: un tenant con cien clientes con acceso multiplicaba por cien lo
// que consumimos de Nominatim, cuya política de uso público prohíbe justo eso.
// Aquí quedan quienes escriben direcciones —altas de envío y zonas—; un cliente
// final o un repartidor no lo hacen nunca.
@Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.MERCHANT)
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Get('search')
  @ApiQuery({ name: 'q', required: true, example: 'Col. Palmira, Tegucigalpa' })
  search(@Query('q') q: string) {
    return this.geocoding.search(q ?? '');
  }
}
