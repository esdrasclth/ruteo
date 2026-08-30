import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
@Controller('analytics')
// NO lleva `@Modulo`, y es a propósito: no hay un `TenantModule.ANALYTICS` que
// ponerle. Añadirlo al catálogo sería vender el panel de indicadores como una
// función aparte, y eso es una decisión de producto, no una corrección: hoy es
// la pantalla de entrada del panel, así que apagarla dejaría al plan FREE
// entrando a un tablero bloqueado.
//
// Si algún día se decide cobrarlo, hace falta: el valor nuevo en el enum (con
// su migración), la entrada en `modules.catalog.ts`, y decidir qué plan lo
// trae. Mientras tanto, lo que sí lo acota son los roles de arriba.
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser, @Query() dto: AnalyticsRangeDto) {
    return this.analytics.overview(user.tenantId, dto);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Query() dto: AnalyticsRangeDto) {
    return this.analytics.dashboard(user.tenantId, dto);
  }

  @Get('shipments')
  shipments(@CurrentUser() user: AuthUser, @Query() dto: AnalyticsRangeDto) {
    return this.analytics.shipments(user.tenantId, dto);
  }

  @Get('payments')
  payments(@CurrentUser() user: AuthUser, @Query() dto: AnalyticsRangeDto) {
    return this.analytics.payments(user.tenantId, dto);
  }

  @Get('drivers')
  drivers(@CurrentUser() user: AuthUser, @Query() dto: AnalyticsRangeDto) {
    return this.analytics.drivers(user.tenantId, dto);
  }

  // Sin `AnalyticsRangeDto`: es una foto del ahora, no un informe de un período.
  // Ver el comentario del servicio.
  @Get('operacion')
  operacion(@CurrentUser() user: AuthUser) {
    return this.analytics.operacion(user.tenantId);
  }

  @Get('entregas')
  entregas(@CurrentUser() user: AuthUser, @Query() dto: AnalyticsRangeDto) {
    return this.analytics.entregas(user.tenantId, dto);
  }
}
