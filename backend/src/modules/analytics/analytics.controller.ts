import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser, @Query() dto: AnalyticsRangeDto) {
    return this.analytics.overview(user.tenantId, dto);
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
}
