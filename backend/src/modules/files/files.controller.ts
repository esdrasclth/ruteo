import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
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
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { UploadUrlDto } from './dto/upload-url.dto';
import { FilesService } from './files.service';

/**
 * Permisos de subida. No pasa ningún archivo por aquí: solo la firma.
 *
 * Sin `@Modulo`: adjuntar la evidencia de una entrega no es una función que se
 * contrate aparte, es parte de entregar. Colgarlo de un módulo dejaría a un
 * repartidor sin poder subir la foto de la entrega que acaba de hacer.
 *
 * DRIVER incluido a propósito: es quien está en la puerta con el teléfono, y es
 * el único que puede tomar esa foto.
 */
@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload-url')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  uploadUrl(@CurrentUser() user: AuthUser, @Body() dto: UploadUrlDto) {
    return this.files.urlDeSubida(user.tenantId, dto);
  }

  // Paso aparte porque el backend no se entera de que el `PUT` ocurrió: el
  // navegador sube directo al almacenamiento. Sin este aviso, saber qué hay en
  // el bucket exigiría recorrerlo.
  @Post('confirm')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  confirm(@CurrentUser() user: AuthUser, @Body() dto: ConfirmUploadDto) {
    return this.files.confirmar(user.tenantId, user.userId ?? undefined, dto);
  }

  // La URL se firma al pedirla y dura minutos. Por eso es un POST y no un GET
  // que devuelva una redirección permanente: lo que se entrega es una
  // credencial de un rato, no una dirección estable.
  @Post(':id/url')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  async url(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { url: await this.files.urlDeDescarga(user.tenantId, id) };
  }
}
