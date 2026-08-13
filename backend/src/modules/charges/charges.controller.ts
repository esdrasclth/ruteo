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
import { ChargesService } from './charges.service';
import { CobrarCargosDto } from './dto/cobrar-cargos.dto';
import { AnularCargoDto, CreateChargeDto } from './dto/create-charge.dto';
import { QueryChargesDto, RangoCargosDto } from './dto/query-charges.dto';

/**
 * Va bajo el módulo PAYMENTS y no uno propio: los cargos son la otra mitad de
 * la misma pregunta —qué se cobra y qué entró—, y una empresa con la pantalla de
 * pagos apagada tampoco tiene nada que hacer con la de cargos. Un módulo más en
 * el menú no habría comprado nada.
 */
@ApiTags('charges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('charges')
@Modulo(TenantModule.PAYMENTS)
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  // Las rutas fijas van antes que las que llevan parámetro: si no, `resumen`
  // acabaría entrando por la de `:id`.
  @Roles(Role.OWNER, Role.ADMIN)
  @Get('resumen')
  resumen(@CurrentUser() user: AuthUser, @Query() rango: RangoCargosDto) {
    return this.charges.resumen(user.tenantId, rango);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @Get('envio/:shipmentId')
  porEnvio(
    @CurrentUser() user: AuthUser,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
  ) {
    return this.charges.porEnvio(user.tenantId, shipmentId);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryChargesDto) {
    return this.charges.list(user.tenantId, query);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateChargeDto) {
    return this.charges.create(user, dto);
  }

  // Cobrar lo hace quien está en el mostrador, así que entra OPERATOR.
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @Post('cobrar')
  cobrar(@CurrentUser() user: AuthUser, @Body() dto: CobrarCargosDto) {
    return this.charges.cobrar(user, dto);
  }

  // Anular no: es la operación que hace desaparecer dinero facturado, y quien
  // atiende el mostrador no debería poder borrar un cobro que le incomoda.
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(':id/anular')
  anular(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularCargoDto,
  ) {
    return this.charges.anular(user, id, dto);
  }
}
