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
import { CompleteReturnDto, CreateReturnDto } from './dto/create-return.dto';
import { QueryReturnsDto } from './dto/query-returns.dto';
import { ReturnsService } from './returns.service';

@ApiTags('returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('returns')
@Modulo(TenantModule.AFTERSALES)
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  // OPERATOR sí decide una devolución, al revés que un reembolso: rendirse con
  // un bulto es una decisión de operación —se agotaron los intentos— y no de
  // caja. Quien lo tiene en la mano es quien sabe que ya no hay más que hacer.
  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReturnDto) {
    return this.returns.create(user.tenantId, dto, user);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  list(@CurrentUser() user: AuthUser, @Query() query: QueryReturnsDto) {
    return this.returns.list(user.tenantId, query);
  }

  @Get('resumen')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  resumen(@CurrentUser() user: AuthUser) {
    return this.returns.resumen(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.returns.findOne(user.tenantId, id);
  }

  @Patch(':id/enviar')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  enviar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.returns.enviar(user.tenantId, id, user);
  }

  @Patch(':id/completar')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  completar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteReturnDto,
  ) {
    return this.returns.completar(user.tenantId, id, dto, user);
  }

  @Patch(':id/cancelar')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  cancelar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.returns.cancelar(user.tenantId, id, user);
  }
}
