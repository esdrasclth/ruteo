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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DriverStatus, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';

@ApiTags('drivers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('drivers')
@Modulo(TenantModule.DRIVERS)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDriverDto) {
    return this.drivers.create(user.tenantId, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @Get()
  @ApiQuery({ name: 'status', enum: DriverStatus, required: false })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: DriverStatus) {
    return this.drivers.list(user.tenantId, status);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.drivers.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.drivers.remove(user.tenantId, id);
  }
}
