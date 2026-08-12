import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { BillingService } from './billing.service';

/**
 * El catálogo de planes, sin sesión.
 *
 * Existe porque el registro deja elegir plan y ahí todavía no hay nadie
 * autenticado: `GET /billing/plans` pide JWT y además cuelga del módulo BILLING,
 * así que no sirve para una pantalla anterior a tener cuenta.
 *
 * No expone nada reservado —son los precios que la landing ya publica— pero
 * lleva techo por IP igualmente: un endpoint público sin cupo es un endpoint que
 * alguien va a usar de test de carga gratis.
 */
@ApiTags('billing')
@Controller('plans')
@UseGuards(PublicRateLimitGuard)
export class PublicPlansController {
  constructor(private readonly billing: BillingService) {}

  @RateLimit(60, 300)
  @Get()
  plans() {
    return this.billing.listPlans();
  }
}
