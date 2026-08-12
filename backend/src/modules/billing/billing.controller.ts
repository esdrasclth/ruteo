import { TenantModule } from '@prisma/client';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CualquierRol, Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BillingService } from './billing.service';
import { CancelSubscriptionDto, SubscribeDto } from './dto/subscribe.dto';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('billing')
@Modulo(TenantModule.BILLING)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @CualquierRol()
  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Get('subscription')
  subscription(@CurrentUser() user: AuthUser) {
    return this.billing.getSubscription(user.tenantId);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @Get('usage')
  usage(@CurrentUser() user: AuthUser) {
    return this.billing.getUsage(user.tenantId);
  }

  @Post('subscribe')
  @Roles(Role.OWNER, Role.ADMIN)
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    return this.billing.subscribe(user, dto);
  }

  @Post('cancel')
  @Roles(Role.OWNER, Role.ADMIN)
  cancel(@CurrentUser() user: AuthUser, @Body() dto: CancelSubscriptionDto) {
    return this.billing.cancel(user, dto.atPeriodEnd ?? false);
  }
}
