import { TenantModule } from '@prisma/client';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CustomsService } from './customs.service';
import { UpsertCustomsDto } from './dto/upsert-customs.dto';

@ApiTags('customs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('customs')
@Modulo(TenantModule.CUSTOMS)
export class CustomsController {
  constructor(private readonly customs: CustomsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertCustomsDto) {
    return this.customs.upsert(user.tenantId, dto);
  }

  @Get(':shipmentId')
  findByShipment(
    @CurrentUser() user: AuthUser,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
  ) {
    return this.customs.findByShipment(user.tenantId, shipmentId);
  }

  @Patch(':shipmentId/clear')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  clear(
    @CurrentUser() user: AuthUser,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
  ) {
    return this.customs.clear(user.tenantId, shipmentId);
  }
}
