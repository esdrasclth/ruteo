import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TenantModule } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { CreateRefundDto } from './dto/create-refund.dto';
import { QueryRefundsDto } from './dto/query-refunds.dto';
import { RefundsService } from './refunds.service';

@ApiTags('refunds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('refunds')
@Modulo(TenantModule.AFTERSALES)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  // Sacar dinero de la caja no es tarea de bodega: OPERATOR queda fuera a
  // propósito, al revés que en excepciones. Aquí el criterio no es quién ve el
  // problema sino quién responde por el dinero.
  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  emitir(@CurrentUser() user: AuthUser, @Body() dto: CreateRefundDto) {
    return this.refunds.emitir(user.tenantId, dto, user);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.SUPPORT)
  list(@CurrentUser() user: AuthUser, @Query() query: QueryRefundsDto) {
    return this.refunds.list(user.tenantId, query);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.SUPPORT)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.refunds.findOne(user.tenantId, id);
  }

  @Patch(':id/completar')
  @Roles(Role.OWNER, Role.ADMIN)
  completar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.refunds.completar(user.tenantId, id, user);
  }

  @Patch(':id/fallar')
  @Roles(Role.OWNER, Role.ADMIN)
  fallar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.refunds.fallar(user.tenantId, id, user);
  }
}
