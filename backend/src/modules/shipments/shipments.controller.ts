import { TenantModule } from '@prisma/client';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiScope, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Alcances } from '../../common/decorators/alcances.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AlcancesGuard } from '../../common/guards/alcances.guard';
import { API_KEY_HEADER } from '../../common/guards/api-key.guard';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { CreateLegDto } from './dto/create-leg.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { QueryShipmentsDto } from './dto/query-shipments.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ShipmentsService } from './shipments.service';

@ApiTags('shipments')
@ApiBearerAuth()
@ApiSecurity(API_KEY_HEADER)
@UseGuards(
  JwtOrApiKeyGuard,
  RolesGuard,
  AlcancesGuard,
  RateLimitGuard,
  TenantAccessGuard,
)
@RateLimit(120, 60)
@Controller('shipments')
@Modulo(TenantModule.SHIPMENTS)
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.MERCHANT)
  @Alcances(ApiScope.SHIPMENTS_WRITE)
  @UseInterceptors(IdempotencyInterceptor)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateShipmentDto) {
    return this.shipments.create(user, dto);
  }

  @Post('import')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.MERCHANT)
  @Alcances(ApiScope.SHIPMENTS_WRITE)
  // Multer NO topa nada por defecto: sin `limits`, un archivo de cientos de MB
  // se cargaba entero a memoria (`file.buffer.toString`) y tumbaba el proceso.
  // 2 MB dan de sobra para las ~10.000 filas que permite `parseShipmentCsv`.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 4 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  import(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required (field "file")');
    }
    return this.shipments.importCsv(user, file.buffer.toString('utf8'));
  }

  @Roles(
    Role.OWNER,
    Role.ADMIN,
    Role.OPERATOR,
    Role.DRIVER,
    Role.MERCHANT,
    Role.SUPPORT,
  )
  @Alcances(ApiScope.SHIPMENTS_READ)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryShipmentsDto) {
    return this.shipments.list(user.tenantId, query);
  }

  // ANTES de `@Get(':id')` a propósito: Nest resuelve por orden de declaración
  // y `:id` lleva `ParseUUIDPipe`, así que declarada después esta ruta no caería
  // en `findOne` sino en un 400 diciendo que «clasificacion» no es un UUID.
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @Get('clasificacion')
  clasificacion(@CurrentUser() user: AuthUser) {
    return this.shipments.clasificacion(user.tenantId);
  }

  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.MERCHANT)
  @Alcances(ApiScope.SHIPMENTS_READ)
  @Get(':id/label')
  @Header('Content-Type', 'image/svg+xml')
  label(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.buildLabel(user.tenantId, id);
  }

  @Roles(
    Role.OWNER,
    Role.ADMIN,
    Role.OPERATOR,
    Role.DRIVER,
    Role.MERCHANT,
    Role.SUPPORT,
  )
  @Alcances(ApiScope.SHIPMENTS_READ)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shipments.findOne(user.tenantId, id);
  }

  @Patch(':id/status')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.shipments.updateStatus(user, id, dto);
  }

  // Entra DRIVER: el que se encuentra con que no había nadie en casa es quien
  // tiene el dato, y obligarle a llamar a la oficina para que alguien lo escriba
  // es como se pierde.
  @Post(':id/notes')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.shipments.addNote(user, id, dto);
  }

  @Post(':id/legs')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  addLeg(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLegDto,
  ) {
    return this.shipments.addLeg(user.tenantId, id, dto);
  }

  @Patch(':id/legs/:legId')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  updateLeg(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('legId', ParseUUIDPipe) legId: string,
    @Body() dto: UpdateLegDto,
  ) {
    return this.shipments.updateLeg(user.tenantId, id, legId, dto);
  }

  @Delete(':id/legs/:legId')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  removeLeg(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('legId', ParseUUIDPipe) legId: string,
  ) {
    return this.shipments.removeLeg(user.tenantId, id, legId);
  }
}
