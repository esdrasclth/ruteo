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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CustomersService } from './customers.service';
import { DireccionesService } from './direcciones.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('customers')
@Modulo(TenantModule.CUSTOMERS)
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly direcciones: DireccionesService,
  ) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user.tenantId, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryCustomersDto) {
    return this.customers.list(user.tenantId, query);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user.tenantId, id, dto);
  }

  // Direcciones reutilizables (fase 5.2). Cuelgan del cliente porque no existen
  // sin él, y no de un módulo propio: una entrada de menú más no es más
  // producto (§7 del plan).

  @Get(':id/addresses')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  listAddresses(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('incluirArchivadas') incluirArchivadas?: string,
  ) {
    return this.direcciones.listar(
      user.tenantId,
      id,
      incluirArchivadas === 'true',
    );
  }

  @Post(':id/addresses')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  createAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.direcciones.crear(user.tenantId, id, dto);
  }

  @Patch('addresses/:addressId')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.direcciones.actualizar(user.tenantId, addressId, dto);
  }

  // Archivar, que no es borrar: a una dirección la referencian envíos ya
  // entregados. Por eso es PATCH y no DELETE — el verbo dice lo que pasa.
  @Patch('addresses/:addressId/archivar')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  archiveAddress(
    @CurrentUser() user: AuthUser,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    return this.direcciones.archivar(user.tenantId, addressId);
  }
}
