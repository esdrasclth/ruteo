import { TenantModule } from '@prisma/client';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationChannel, NotificationStatus, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard, TenantAccessGuard)
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

  // Segundo freno, además del filtro de destinatario: aunque todos los avisos
  // vayan a gente de la propia empresa, sin techo esto sirve para bombardear el
  // buzón de un cliente y de paso quemar la cuota de Resend. 60 a la hora cubre
  // de sobra el envío manual, que es lo que este endpoint es.
  @RateLimit(60, 3600)
  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  send(@CurrentUser() user: AuthUser, @Body() dto: SendNotificationDto) {
    return this.notifications.send(user.tenantId, dto);
  }
}
