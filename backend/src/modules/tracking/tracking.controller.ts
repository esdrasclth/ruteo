import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { pareceNumeroDeRastreo } from '../shipments/tracking-number';
import { TrackingService } from './tracking.service';

@ApiTags('tracking')
@Controller('tracking')
@UseGuards(PublicRateLimitGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /**
   * Público, sin sesión: "¿dónde está mi paquete?".
   *
   * El techo por IP no es contra la enumeración —`32^10` combinaciones no se
   * recorren—, sino contra la amplificación: cada llamada dispara dos consultas,
   * la segunda con joins a tramos, eventos, aduana y transportista. Sin sesión y
   * sin cupo, es la forma más barata que hay de cargar Postgres desde fuera.
   *
   * 60 por minuto deja seguir un envío recargando la página y compartir el
   * enlace por WhatsApp sin que nadie choque con el límite.
   */
  @RateLimit(60, 60)
  @Get(':trackingNumber')
  track(@Param('trackingNumber') trackingNumber: string) {
    // Se descarta lo que ni siquiera tiene forma de número antes de ir a la
    // base. Mismo 404 que un número bien formado que no existe: distinguirlos
    // no aporta nada a quien rastrea y confirma formatos a quien prueba.
    if (!pareceNumeroDeRastreo(trackingNumber)) {
      throw new NotFoundException('Tracking number not found');
    }
    return this.tracking.getPublicTracking(trackingNumber);
  }
}
