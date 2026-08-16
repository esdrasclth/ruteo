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
import {
  CreateTripDto,
  CreateWarehouseDto,
  UpdateTripStatusDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';
import { WarehousesService } from './warehouses.service';
import { PaginacionDto } from '../../common/dto/paginacion.dto';

// Bajo el módulo INTAKE: una bodega es parte de la recepción, y darle módulo
// propio habría obligado a activar una entrada más para poder usar la que ya
// está activa.
@ApiTags('warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('warehouses')
@Modulo(TenantModule.INTAKE)
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  list(@CurrentUser() user: AuthUser) {
    return this.warehouses.list(user.tenantId);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(user.tenantId, dto);
  }

  // Antes de ':id' para que el segmento estático gane el match.
  @Get('trips')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  listTrips(@CurrentUser() user: AuthUser, @Query() query: PaginacionDto) {
    return this.warehouses.listTrips(user.tenantId, query);
  }

  @Post('trips')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  createTrip(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.warehouses.createTrip(user.tenantId, dto);
  }

  @Patch('trips/:id/status')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  updateTripStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripStatusDto,
  ) {
    return this.warehouses.updateTripStatus(user.tenantId, id, dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouses.update(user.tenantId, id, dto);
  }
}
