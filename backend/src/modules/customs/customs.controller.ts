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
import { CustomsService } from './customs.service';
import { CustomsDocsService } from './customs-docs.service';
import {
  AddDocumentDto,
  CerrarReglaDto,
  CreateCustomsRuleDto,
} from './dto/customs-rule.dto';
import { UpsertCustomsDto } from './dto/upsert-customs.dto';

@ApiTags('customs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('customs')
@Modulo(TenantModule.CUSTOMS)
export class CustomsController {
  constructor(
    private readonly customs: CustomsService,
    private readonly docs: CustomsDocsService,
  ) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertCustomsDto) {
    return this.customs.upsert(user.tenantId, dto, user.userId ?? undefined);
  }

  // --- Reglas. Antes de ':shipmentId' para que el segmento estatico gane. ---

  @Get('rules')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  listRules(
    @CurrentUser() user: AuthUser,
    @Query('vigentes') vigentes?: string,
  ) {
    return this.docs.listRules(user.tenantId, vigentes === 'true');
  }

  // Solo OWNER y ADMIN: una regla decide cuanto se le cobra a cada cliente en
  // aduana. No es configuracion de operacion diaria.
  @Post('rules')
  @Roles(Role.OWNER, Role.ADMIN)
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomsRuleDto) {
    return this.docs.createRule(user.tenantId, dto);
  }

  // Cerrar, no borrar: una regla borrada se lleva por delante la explicacion de
  // todas las liquidaciones que se hicieron con ella.
  @Patch('rules/:id/cerrar')
  @Roles(Role.OWNER, Role.ADMIN)
  cerrarRule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CerrarReglaDto,
  ) {
    return this.docs.cerrarRule(user.tenantId, id, dto);
  }

  // --- Documentos ----------------------------------------------------------

  @Get(':shipmentId/documents')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  listDocuments(
    @CurrentUser() user: AuthUser,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
  ) {
    return this.docs.listDocuments(user.tenantId, shipmentId);
  }

  @Post(':shipmentId/documents')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.docs.addDocument(
      user.tenantId,
      shipmentId,
      dto,
      user.userId ?? undefined,
    );
  }

  @Patch('documents/:id/verify')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  verifyDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.docs.verifyDocument(
      user.tenantId,
      id,
      user.userId ?? undefined,
    );
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
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
    return this.customs.clear(
      user.tenantId,
      shipmentId,
      user.userId ?? undefined,
    );
  }
}
