import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CualquierRol, Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { RequiereCorreoVerificado } from '../../common/decorators/verified-email.decorator';
import { AvatarUploadUrlDto, FijarAvatarDto } from './dto/avatar.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedEmailGuard, TenantAccessGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @CualquierRol()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.tenantId, user.userId!);
  }

  // Abierto a todos los roles: cambiarse el propio nombre lo hace cualquiera.
  // Lo que NO puede es tocarse el rol ni el estado — ver `UpdateMeDto`.
  @CualquierRol()
  @Patch('me')
  actualizarme(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.actualizarme(user.tenantId, user.userId!, dto);
  }

  // Los tres de la foto van bajo `me` y no en `/files`, que es donde vive el
  // resto de subidas: allí el propietario del archivo viaja en el cuerpo y hay
  // que comprobarlo, y además sus roles están acotados a quienes suben pruebas
  // de entrega y fotos de bulto. Una foto de perfil la sube cualquiera y sólo
  // la suya, así que el propietario es la sesión y no hay nada que validar.
  @CualquierRol()
  @Post('me/avatar/upload-url')
  urlDeSubidaDeAvatar(
    @CurrentUser() user: AuthUser,
    @Body() dto: AvatarUploadUrlDto,
  ) {
    return this.users.urlDeSubidaDeAvatar(user.tenantId, user.userId!, dto);
  }

  @CualquierRol()
  @Put('me/avatar')
  fijarAvatar(@CurrentUser() user: AuthUser, @Body() dto: FijarAvatarDto) {
    return this.users.fijarAvatar(user.tenantId, user.userId!, dto);
  }

  @CualquierRol()
  @Delete('me/avatar')
  quitarAvatar(@CurrentUser() user: AuthUser) {
    return this.users.quitarAvatar(user.tenantId, user.userId!);
  }

  @CualquierRol()
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.users.changePassword(user, dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN)
  list(@CurrentUser() user: AuthUser, @Query() query: QueryUsersDto) {
    return this.users.list(user.tenantId, query);
  }

  // Dar de alta a otra persona es ampliar quién entra a la empresa. Si el
  // correo del que invita no está probado, la cadena de confianza arranca de
  // una dirección que puede no ser suya.
  @Post()
  @RequiereCorreoVerificado()
  @Roles(Role.OWNER, Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(user, id, dto);
  }

  @Post(':id/reset-password')
  @Roles(Role.OWNER, Role.ADMIN)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.users.resetPassword(user, id, dto);
  }
}
