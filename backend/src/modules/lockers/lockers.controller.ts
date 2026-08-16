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
import { ApiBearerAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiScope, PackageStatus, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Alcances } from '../../common/decorators/alcances.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AlcancesGuard } from '../../common/guards/alcances.guard';
import { API_KEY_HEADER } from '../../common/guards/api-key.guard';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateLockerDto } from './dto/create-locker.dto';
import { AddPackagePhotoDto } from './dto/add-photo.dto';
import { IntakePackageDto } from './dto/intake-package.dto';
import { PreAlertPackageDto } from './dto/pre-alert-package.dto';
import { QueryLockersDto } from './dto/query-lockers.dto';
import { QueryPackagesDto } from './dto/query-packages.dto';
import { UpdateLockerDto } from './dto/update-locker.dto';
import { LockersService } from './lockers.service';

/**
 * Acepta sesión de panel **y** llave de API (`x-api-key`).
 *
 * Lo segundo existe para que una empresa pueda dar de alta casilleros desde su
 * propia web sin que un operador teclee nada. Qué endpoints entran en ese trato
 * lo dice `@Alcances`, uno por uno: sin el decorador la llave no pasa, así que
 * la recepción de bodega y las fotos siguen siendo cosa de quien tiene sesión
 * aunque cuelguen de este mismo controlador.
 *
 * El cupo es más estrecho que el de envíos a propósito: detrás de esto hay un
 * formulario público, y el alta de casillero crea también un cliente.
 */
@ApiTags('lockers')
@ApiBearerAuth()
@ApiSecurity(API_KEY_HEADER)
@UseGuards(
  JwtOrApiKeyGuard,
  RolesGuard,
  AlcancesGuard,
  RateLimitGuard,
  TenantAccessGuard,
)
@RateLimit(60, 60)
@Controller('lockers')
@Modulo(TenantModule.LOCKERS)
export class LockersController {
  constructor(private readonly lockers: LockersService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.MERCHANT)
  @Alcances(ApiScope.LOCKERS_WRITE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLockerDto) {
    return this.lockers.create(user.tenantId, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT, Role.MERCHANT)
  @Alcances(ApiScope.LOCKERS_READ)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryLockersDto) {
    return this.lockers.list(user.tenantId, query);
  }

  // Declared before ':id' routes so the static segments win the match.
  @Post('intake')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  intake(@CurrentUser() user: AuthUser, @Body() dto: IntakePackageDto) {
    return this.lockers.intake(user.tenantId, dto, user.userId ?? undefined);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  @Get('packages')
  listAllPackages(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryPackagesDto,
  ) {
    return this.lockers.listAllPackages(user.tenantId, query);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT, Role.MERCHANT)
  @Alcances(ApiScope.LOCKERS_READ)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lockers.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.MERCHANT)
  @Alcances(ApiScope.LOCKERS_WRITE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLockerDto,
  ) {
    return this.lockers.update(user.tenantId, id, dto);
  }

  @Post(':id/packages')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.MERCHANT)
  @Alcances(ApiScope.LOCKERS_WRITE)
  preAlert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreAlertPackageDto,
  ) {
    return this.lockers.preAlert(user.tenantId, id, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT, Role.MERCHANT)
  @Alcances(ApiScope.LOCKERS_READ)
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

  // Las fotos van en su propio endpoint y no dentro de la recepción: para subir
  // un archivo hay que decir a qué cuelga, y al recibir el bulto todavía no
  // existe. Además el caso real no es solo fotografiar al recibir — los daños
  // se descubren al día siguiente, cuando alguien mueve la caja.
  @Post(':id/packages/:packageId/photos')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Body() dto: AddPackagePhotoDto,
  ) {
    return this.lockers.addPhoto(user.tenantId, id, packageId, dto);
  }

  // Anidada bajo `:id` como su hermana POST, y no como `packages/:id/photos`:
  // este archivo declara las rutas estáticas ANTES que las de `:id` justo para
  // que ganen el match, y una estática nueva al final rompería esa regla sin
  // que se note hasta que alguien añada un segmento que sí colisione.
  @Get(':id/packages/:packageId/photos')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  listPhotos(
    @CurrentUser() user: AuthUser,
    @Param('packageId', ParseUUIDPipe) packageId: string,
  ) {
    return this.lockers.listPhotos(user.tenantId, packageId);
  }
}
