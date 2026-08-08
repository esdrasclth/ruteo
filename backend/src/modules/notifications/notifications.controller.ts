import { TenantModule } from '@prisma/client';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  NotificationChannel,
  NotificationStatus,
  Role,
} from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('notifications')
@Modulo(TenantModule.NOTIFICATIONS)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: NotificationStatus, required: false })
  @ApiQuery({ name: 'channel', enum: NotificationChannel, required: false })
  @ApiQuery({ name: 'shipmentId', required: false })
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: NotificationStatus,
    @Query('channel') channel?: NotificationChannel,
    @Query('shipmentId') shipmentId?: string,
  ) {
    return this.notifications.list(user.tenantId, {
      status,
      channel,
      shipmentId,
    });
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  send(@CurrentUser() user: AuthUser, @Body() dto: SendNotificationDto) {
    return this.notifications.send(user.tenantId, dto);
  }
}
