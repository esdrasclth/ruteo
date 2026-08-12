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
  CreateExceptionDto,
  UpdateExceptionDto,
} from './dto/create-exception.dto';
import { QueryExceptionsDto } from './dto/query-exceptions.dto';
import { ExceptionsService } from './exceptions.service';

@ApiTags('exceptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('exceptions')
@Modulo(TenantModule.EXCEPTIONS)
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  // OPERATOR incluido: quien está en la bodega es quien ve el problema, y una
  // excepción que solo puede levantar un administrador se levanta tarde o no se
  // levanta.
  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExceptionDto) {
    return this.exceptions.create(user.tenantId, dto, user.userId ?? undefined);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  list(@CurrentUser() user: AuthUser, @Query() query: QueryExceptionsDto) {
    return this.exceptions.list(user.tenantId, query);
  }

  // Antes de ':id' para que el segmento estático gane el match.
  @Get('resumen')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  resumen(@CurrentUser() user: AuthUser) {
    return this.exceptions.resumen(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.SUPPORT)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exceptions.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExceptionDto,
  ) {
    return this.exceptions.update(user.tenantId, id, dto);
  }
}
