import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AddManifestItemDto } from './dto/add-item.dto';
import { CreateManifestDto } from './dto/create-manifest.dto';
import { QueryManifestsDto } from './dto/query-manifests.dto';
import { ReconcileManifestDto } from './dto/reconcile.dto';
import { ManifestsService } from './manifests.service';

@ApiTags('manifests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('manifests')
@Modulo(TenantModule.MANIFESTS)
export class ManifestsController {
  constructor(private readonly manifests: ManifestsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateManifestDto) {
    return this.manifests.create(user.tenantId, dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  list(@CurrentUser() user: AuthUser, @Query() query: QueryManifestsDto) {
    return this.manifests.list(user.tenantId, query);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manifests.findOne(user.tenantId, id);
  }

  @Post(':id/items')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  addItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddManifestItemDto,
  ) {
    return this.manifests.addItem(user.tenantId, id, dto);
  }

  @Delete(':id/items/:itemId')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.manifests.removeItem(user.tenantId, id, itemId);
  }

  // Cierra el documento y congela los totales declarados. A partir de aquí las
  // guías no se tocan: un documento que se modifica después de enviarlo deja de
  // valer como documento.
  @Post(':id/transmit')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  transmit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manifests.transmit(user.tenantId, id);
  }

  // El cotejo: lo declarado contra lo contado. Cada diferencia sale como
  // excepción, no como nota.
  @Post(':id/reconcile')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  reconcile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileManifestDto,
  ) {
    return this.manifests.reconcile(
      user.tenantId,
      id,
      dto,
      user.userId ?? undefined,
    );
  }
}
