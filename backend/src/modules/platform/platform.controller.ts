import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import type { PlatformJwtPayload } from './platform-auth.service';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformService } from './platform.service';
import {
  BorrarTenantDto,
  CambiarEstadoAdminDto,
  CambiarEstadoTenantDto,
  CambiarModuloDto,
  CambiarPlanDto,
  PlatformLoginDto,
} from './dto/platform.dto';
import { MODULOS } from './modules.catalog';
import { PLANS } from '../billing/plans';

type PeticionPlataforma = {
  platformAdmin: PlatformJwtPayload;
  ip?: string;
};

// API del panel de plataforma. Va bajo /platform y NO bajo /users o /tenants
// para que quede evidente en los registros y en cualquier proxy qué peticiones
// cruzan empresas.

@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly platform: PlatformService,
  ) {}

  // La IP se guarda en el registro: saber QUIÉN cambió algo vale más si también
  // se sabe desde dónde.
  //
  // Se usa `req.ip`, que Express resuelve con `trust proxy` (fijado en
  // `main.ts`). Leer `x-forwarded-for` a mano dejaba que el propio actor
  // eligiera qué IP quedaba anotada, y una auditoría que el auditado puede
  // escribir no sirve para nada.
  private actor(req: { platformAdmin: PlatformJwtPayload; ip?: string }) {
    return {
      id: req.platformAdmin.sub,
      email: req.platformAdmin.email,
      ip: req.ip,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicRateLimitGuard)
  // Más estrecho que el login de tenant: aquí cada cuenta abre TODAS las
  // empresas, así que el coste de probar tiene que ser mayor.
  @RateLimit(5, 300)
  login(@Body() dto: PlatformLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // --- a partir de aquí, todo exige sesión de plataforma --------------------

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  me(@Req() req: { platformAdmin: PlatformJwtPayload }) {
    return req.platformAdmin;
  }

  @Get('catalogo')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  catalogo() {
    // Planes y módulos se sirven desde el backend para que el panel no tenga
    // que mantener una copia que se desincroniza en cuanto cambie un plan.
    return { planes: Object.values(PLANS), modulos: MODULOS };
  }

  @Get('resumen')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  resumen() {
    return this.platform.resumen();
  }

  @Get('tenants')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  listar(@Query('q') q?: string) {
    return this.platform.listarTenants(q?.trim() || undefined);
  }

  @Get('tenants/:id')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.detalleTenant(id);
  }

  @Patch('tenants/:id/plan')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  cambiarPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarPlanDto,
    @Req() req: PeticionPlataforma,
  ) {
    return this.platform.cambiarPlan(id, dto.plan, this.actor(req));
  }

  @Patch('tenants/:id/status')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoTenantDto,
    @Req() req: PeticionPlataforma,
  ) {
    return this.platform.cambiarEstado(
      id,
      dto.status,
      dto.reason,
      this.actor(req),
    );
  }

  /**
   * Borra una empresa y todo lo suyo. Irreversible.
   *
   * El identificador y el motivo van en el CUERPO y no en la URL: una ruta que
   * borra empresas con solo llamarla acaba disparada por un historial del
   * navegador, un reintento automático o un `curl` copiado a medias.
   */
  @Delete('tenants/:id')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  borrarTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BorrarTenantDto,
    @Req() req: PeticionPlataforma,
  ) {
    return this.platform.borrarTenant(
      id,
      dto.slug,
      dto.reason,
      this.actor(req),
    );
  }

  @Patch('tenants/:id/modules')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  cambiarModulo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarModuloDto,
    @Req() req: PeticionPlataforma,
  ) {
    return this.platform.cambiarModulo(
      id,
      dto.module,
      dto.enabled,
      dto.reason,
      this.actor(req),
    );
  }

  // La busqueda NO se anota en el historial: es de solo lectura y se usa
  // decenas de veces al dia, asi que registrarla llenaria de ruido el registro
  // y taparia los cambios, que es lo que de verdad hay que poder rastrear.
  @Get('buscar')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  buscar(@Query('q') q: string) {
    return this.platform.buscar(q ?? '');
  }

  @Get('salud')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  salud() {
    return this.platform.salud();
  }

  @Get('uso')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  uso() {
    return this.platform.usoDePlanes();
  }

  @Get('ingresos')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  ingresos() {
    return this.platform.ingresos();
  }

  @Get('audit')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  historial(@Query('tenantId') tenantId?: string) {
    return this.platform.historial(tenantId?.trim() || undefined);
  }

  @Get('admins')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  admins() {
    return this.platform.listarAdmins();
  }

  @Patch('admins/:id/status')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  cambiarEstadoAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoAdminDto,
    @Req() req: PeticionPlataforma,
  ) {
    return this.platform.cambiarEstadoAdmin(id, dto.status, this.actor(req));
  }
}
