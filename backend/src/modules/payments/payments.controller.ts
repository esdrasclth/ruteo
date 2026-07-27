import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PaymentStatus, PaymentType, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: PaymentStatus, required: false })
  @ApiQuery({ name: 'type', enum: PaymentType, required: false })
  @ApiQuery({ name: 'driverId', required: false })
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: PaymentStatus,
    @Query('type') type?: PaymentType,
    @Query('driverId') driverId?: string,
  ) {
    return this.payments.list(user.tenantId, { status, type, driverId });
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.payments.summary(user.tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payments.findOne(user.tenantId, id);
  }

  @Patch(':id/collect')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  collect(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CollectPaymentDto,
  ) {
    return this.payments.collect(user, id, dto);
  }

  @Patch(':id/remit')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  remit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.remit(user, id);
  }
}
