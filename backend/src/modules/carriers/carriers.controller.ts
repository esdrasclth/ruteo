import { TenantModule } from '@prisma/client';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import {
  Body,
  Controller,
  Delete,
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
import { CarriersService } from './carriers.service';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { UpdateCarrierDto } from './dto/update-carrier.dto';

@ApiTags('carriers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('carriers')
@Modulo(TenantModule.CARRIERS)
export class CarriersController {
  constructor(private readonly carriers: CarriersService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCarrierDto) {
    return this.carriers.create(user.tenantId, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.carriers.list(user.tenantId);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.carriers.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCarrierDto,
  ) {
    return this.carriers.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.carriers.remove(user.tenantId, id);
  }
}
