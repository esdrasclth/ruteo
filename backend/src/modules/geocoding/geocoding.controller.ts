import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { GeocodingService } from './geocoding.service';

@ApiTags('geocoding')
@ApiBearerAuth()
// Con sesión y con tope: el buscador dispara una consulta por pausa de tecleo, y
// Nominatim prohíbe el uso masivo. Sin este límite un solo usuario impaciente
// podría hacer que nos bloqueen el servicio a todos los tenants.
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit(30, 60)
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Get('search')
  @ApiQuery({ name: 'q', required: true, example: 'Col. Palmira, Tegucigalpa' })
  search(@Query('q') q: string) {
    return this.geocoding.search(q ?? '');
  }
}
