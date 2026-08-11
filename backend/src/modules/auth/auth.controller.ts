import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { AuthService, EmpresasDeAcceso, Tokens } from './auth.service';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { CredentialsService } from './credentials.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { HandoffDto } from './dto/handoff.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordCodeDto } from './dto/reset-password-code.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyEmailPublicDto } from './dto/verify-email-public.dto';
import type { RefreshPayload } from './strategies/jwt-refresh.strategy';

@ApiTags('auth')
@Controller('auth')
@UseGuards(PublicRateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly credenciales: CredentialsService,
  ) {}

  // Registrar empresas en bucle es la forma barata de ensuciar la instancia de
  // identidad, donde el nombre de usuario es único globalmente.
  @RateLimit(5, 3600)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<Tokens> {
    return this.auth.register(dto);
  }

  // El tope por IP frena el barrido; el bloqueo por cuenta (LoginThrottle)
  // frena el ataque dirigido a una persona concreta. Hacen falta los dos.
  //
  // Devuelve una cosa u otra según venga slug: los tokens si la petición ya
  // sabe a qué empresa entra, o la lista de empresas con su vale de traspaso si
  // hay que averiguarlo por el correo. Ver `AuthService.login`.
  @RateLimit(10, 300)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<Tokens | EmpresasDeAcceso> {
    return this.auth.login(dto);
  }

  // Canje del vale que emitió el login del panel raíz. Aquí es donde nace la
  // sesión en el origen de la empresa.
  //
  // El tope es más alto que el del login porque un canje legítimo puede
  // repetirse —recargar la pestaña, un reintento de red— y porque el vale ya es
  // de un solo uso y dura un minuto: no hay nada que barrer. Lo que frena es
  // que adivinar 256 bits en 60 segundos no ocurre.
  @RateLimit(30, 300)
  @Post('handoff')
  @HttpCode(HttpStatus.OK)
  handoff(@Body() dto: HandoffDto): Promise<Tokens> {
    return this.auth.canjearHandoff(dto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtRefreshGuard)
  refresh(@CurrentUser() user: RefreshPayload): Promise<Tokens> {
    return this.auth.refresh(user.tid, user.sub, user.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    if (user.userId) {
      await this.auth.logout(user.tenantId, user.userId);
    }
  }

  // Público: quien ha olvidado la contraseña no tiene sesión.
  //
  // Responde 202 SIEMPRE, exista o no la cuenta. Si distinguiera, este endpoint
  // serviría para averiguar qué correos están dados de alta en cada empresa.
  // Sin techo, este endpoint sirve para bombardear el buzón de alguien y de
  // paso quemar la cuota de Resend.
  @RateLimit(5, 900)
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.credenciales.solicitarRestablecimiento(dto.slug, dto.email);
    return { ok: true };
  }

  @RateLimit(10, 900)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordCodeDto,
  ): Promise<{ ok: true }> {
    await this.credenciales.restablecer(
      dto.slug,
      dto.email,
      dto.code,
      dto.newPassword,
    );
    return { ok: true };
  }

  @Post('send-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async sendVerification(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    await this.credenciales.reenviarVerificacion(user.tenantId, user.userId!);
    return { ok: true };
  }

  // Público: el enlace del correo puede abrirse en el móvil, donde lo normal
  // es no tener sesión iniciada. Exigir sesión aquí obligaría a entrar antes de
  // poder pulsar el enlace, que es justo la fricción que el enlace evita.
  // El secreto es el código: de un solo uso, con caducidad y tope de intentos.
  @RateLimit(15, 900)
  @Post('verify-email-link')
  @HttpCode(HttpStatus.OK)
  async verifyEmailLink(
    @Body() dto: VerifyEmailPublicDto,
  ): Promise<{ ok: true }> {
    await this.credenciales.verificarCorreoPublico(
      dto.slug,
      dto.email,
      dto.code,
    );
    return { ok: true };
  }

  // Público: el invitado todavía no tiene contraseña con la que entrar.
  @RateLimit(10, 900)
  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
  ): Promise<{ ok: true }> {
    await this.credenciales.aceptarInvitacion(
      dto.slug,
      dto.email,
      dto.code,
      dto.password,
    );
    return { ok: true };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async verifyEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyEmailDto,
  ): Promise<{ ok: true }> {
    await this.credenciales.verificarCorreo(
      user.tenantId,
      user.userId!,
      dto.code,
    );
    return { ok: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
