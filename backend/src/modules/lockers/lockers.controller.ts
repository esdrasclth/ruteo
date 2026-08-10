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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PackageStatus, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateLockerDto } from './dto/create-locker.dto';
import { IntakePackageDto } from './dto/intake-package.dto';
import { PreAlertPackageDto } from './dto/pre-alert-package.dto';
import { QueryPackagesDto } from './dto/query-packages.dto';
import { UpdateLockerDto } from './dto/update-locker.dto';
import { LockersService } from './lockers.service';

@ApiTags('lockers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('lockers')
@Modulo(TenantModule.LOCKERS)
export class LockersController {
  constructor(private readonly lockers: LockersService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLockerDto) {
    return this.lockers.create(user.tenantId, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.lockers.list(user.tenantId);
  }

  // Declared before ':id' routes so the static segments win the match.
  @Post('intake')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  intake(@CurrentUser() user: AuthUser, @Body() dto: IntakePackageDto) {
    return this.lockers.intake(user.tenantId, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get('packages')
  listAllPackages(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryPackagesDto,
  ) {
    return this.lockers.listAllPackages(user.tenantId, query);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lockers.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLockerDto,
  ) {
    return this.lockers.update(user.tenantId, id, dto);
  }

  @Post(':id/packages')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.MERCHANT)
  preAlert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreAlertPackageDto,
  ) {
    return this.lockers.preAlert(user.tenantId, id, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get(':id/packages')
  @ApiQuery({ name: 'status', enum: PackageStatus, required: false })
  listPackages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: PackageStatus,
  ) {
    return this.lockers.listPackages(user.tenantId, id, status);
  }

  @Patch(':id/packages/:packageId/receive')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  receivePackage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('packageId', ParseUUIDPipe) packageId: string,
  ) {
    return this.lockers.receivePackage(user.tenantId, id, packageId);
  }
}
