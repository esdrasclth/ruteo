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
import { ClaimsService } from './claims.service';
import { AddClaimFileDto } from './dto/add-claim-file.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { QueryClaimsDto } from './dto/query-claims.dto';
import {
  ApproveClaimDto,
  RejectClaimDto,
  SettleClaimDto,
} from './dto/resolve-claim.dto';

@ApiTags('claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('claims')
@Modulo(TenantModule.AFTERSALES)
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  // SUPPORT puede ABRIR uno: es quien atiende el teléfono cuando el cliente
  // llama, y obligarle a pedirle a un administrador que lo registre es cómo se
  // pierden los reclamos que entran a las cinco de la tarde.
  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClaimDto) {
    return this.claims.create(user.tenantId, dto, user);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  list(@CurrentUser() user: AuthUser, @Query() query: QueryClaimsDto) {
    return this.claims.list(user.tenantId, query);
  }

  // Antes de ':id' para que el segmento estático gane el match.
  @Get('resumen')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  resumen(@CurrentUser() user: AuthUser) {
    return this.claims.resumen(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.claims.findOne(user.tenantId, id);
  }

  @Patch(':id/investigar')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  investigar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.claims.investigar(user.tenantId, id, user);
  }

  // Decidir sí es de quien responde por el dinero: aprobar compromete caja y
  // rechazar compromete al cliente. Ni OPERATOR ni SUPPORT deciden.
  @Patch(':id/aprobar')
  @Roles(Role.OWNER, Role.ADMIN)
  aprobar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveClaimDto,
  ) {
    return this.claims.aprobar(user.tenantId, id, dto, user);
  }

  @Patch(':id/rechazar')
  @Roles(Role.OWNER, Role.ADMIN)
  rechazar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectClaimDto,
  ) {
    return this.claims.rechazar(user.tenantId, id, dto, user);
  }

  @Patch(':id/liquidar')
  @Roles(Role.OWNER, Role.ADMIN)
  liquidar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleClaimDto,
  ) {
    return this.claims.liquidar(user.tenantId, id, dto, user);
  }

  @Post(':id/archivos')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  addFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddClaimFileDto,
  ) {
    return this.claims.addFile(user.tenantId, id, dto);
  }

  @Get(':id/archivos')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  listFiles(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.claims.listFiles(user.tenantId, id);
  }
}
