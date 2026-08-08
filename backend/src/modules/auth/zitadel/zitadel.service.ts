import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Cliente de la Session API v2 de ZITADEL.
//
// Se usa la Session API y no OIDC porque el panel conserva sus propias
// pantallas de acceso (ver docs/decision-auth-zitadel.md): ZITADEL guarda las
// credenciales y aplica sus políticas —bloqueo por reintentos, complejidad,
// MFA—, y este backend sigue emitiendo su token de sesión con `tid`, que es de
// lo que depende el Row-Level Security. Así el aislamiento multi-tenant no
// cambia de manos en la migración.
//
// Contrato (docs de ZITADEL):
//   POST   /v2/sessions          { checks: { user: { loginName } } }
//   PATCH  /v2/sessions/{id}     { sessionToken, checks: { password } }
//   DELETE /v2/sessions/{id}
//   POST   /v2/users/human
// Todas exigen `Authorization: Bearer <token de cuenta de servicio>`.

/**
 * Nombre de usuario en ZITADEL para un correo dentro de un tenant.
 *
 * Ruteo permite el MISMO correo en tenants distintos (`@@unique([tenantId,
 * email])`), pero esta instancia exige el nombre de usuario único en toda la
 * instancia — comprobado: dar de alta el mismo `username` en otra organización
 * también devuelve 409. La alternativa era activar "User Login must be Domain",
 * que es un ajuste de instancia y `auth.brandsofts.com` está compartido con
 * otros proyectos: cambiarlo podría romperlos.
 *
 * Así que el ámbito se construye en el nombre. El correo real va aparte, en el
 * campo `email` del usuario.
 */
export function nombreDeUsuario(slug: string, email: string): string {
  return `${slug}:${email.toLowerCase()}`;
}

export interface CredencialesVerificadas {
  /** Id del usuario en ZITADEL. Se guarda en `User.externalId`. */
  zitadelUserId: string;
  /** Organización a la que pertenece; es lo que mapea al tenant de Ruteo. */
  organizationId: string | null;
}

export interface NuevoUsuario {
  /** Nombre de usuario ya construido con `nombreDeUsuario()`. */
  loginName: string;
  /** Correo real del usuario; puede repetirse entre tenants. */
  email: string;
  password: string;
  nombre?: string;
  organizationId?: string;
}

interface RespuestaSesion {
  sessionId?: string;
  sessionToken?: string;
  session?: {
    id?: string;
    factors?: {
      user?: { id?: string; organizationId?: string };
      password?: { verifiedAt?: string };
    };
  };
}

@Injectable()
export class ZitadelService {
  private readonly log = new Logger(ZitadelService.name);

  constructor(private readonly config: ConfigService) {}

  private get issuer(): string {
    return this.config
      .getOrThrow<string>('ZITADEL_ISSUER')
      .replace(/\/+$/, '');
  }

  private get token(): string {
    const t = this.config.get<string>('ZITADEL_SERVICE_TOKEN') ?? '';
    if (!t) {
      // Sin cuenta de servicio no hay forma de hablar con la Session API. Es un
      // fallo de despliegue, no del usuario: 503 y no 401, para que no se
      // confunda con una contraseña mal escrita en los registros.
      throw new ServiceUnavailableException('ZITADEL no está configurado');
    }
    return t;
  }

  /**
   * Comprueba usuario y contraseña. Devuelve el id de ZITADEL si son válidos.
   *
   * Cualquier fallo atribuible a las credenciales sale como `Unauthorized` sin
   * detalle: distinguir "ese usuario no existe" de "la contraseña no es esa"
   * le dice a quien prueba correos cuáles están dados de alta.
   */
  async verificarCredenciales(
    loginName: string,
    password: string,
  ): Promise<CredencialesVerificadas> {
    // 1. Sesión con el usuario. Un 404 aquí significa que no existe.
    const creada = await this.peticion<RespuestaSesion>(
      'POST',
      '/v2/sessions',
      { checks: { user: { loginName } } },
      { tratar404ComoCredencial: true },
    );

    const sessionId = creada.sessionId ?? creada.session?.id;
    if (!sessionId || !creada.sessionToken) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    try {
      // 2. La contraseña se comprueba actualizando la sesión. ZITADEL responde
      //    con error si no cuadra, y es aquí donde aplica su política de
      //    bloqueo por reintentos.
      await this.peticion<RespuestaSesion>(
        'PATCH',
        `/v2/sessions/${sessionId}`,
        {
          sessionToken: creada.sessionToken,
          checks: { password: { password } },
        },
        { tratar404ComoCredencial: true },
      );

      // 3. Releer la sesión. El PATCH devuelve solo `details` y `sessionToken`
      //    —comprobado contra la instancia el 2026-08-08—, así que los factores
      //    hay que pedirlos aparte. Es la llamada que confirma de verdad que la
      //    contraseña quedó verificada, en vez de deducirlo de un 200.
      const estado = await this.peticion<RespuestaSesion>(
        'GET',
        `/v2/sessions/${sessionId}`,
      );

      const factores = estado.session?.factors;
      // No basta con que las llamadas no fallen: el factor tiene que estar
      // marcado como verificado. Sin esto, un cambio futuro que devolviera 200
      // sin verificar dejaría pasar a cualquiera.
      if (!factores?.password?.verifiedAt) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      return {
        zitadelUserId: factores.user?.id ?? '',
        organizationId: factores.user?.organizationId ?? null,
      };
    } finally {
      // La sesión de ZITADEL no se conserva: el token de sesión lo emite Ruteo.
      // Se cierra en `finally` para que tampoco quede colgando si la contraseña
      // falla. Es de mejor esfuerzo; que no se pueda cerrar no invalida nada.
      void this.cerrarSesion(sessionId, creada.sessionToken);
    }
  }

  /** Alta de un usuario humano con contraseña. Devuelve su id en ZITADEL. */
  async crearUsuario(datos: NuevoUsuario): Promise<string> {
    const cuerpo: Record<string, unknown> = {
      username: datos.loginName,
      profile: {
        givenName: datos.nombre ?? datos.email,
        familyName: datos.nombre ?? datos.email,
      },
      email: { email: datos.email, isVerified: false },
      password: { password: datos.password, changeRequired: false },
    };
    if (datos.organizationId) {
      cuerpo.organization = { orgId: datos.organizationId };
    }

    const res = await this.peticion<{ userId?: string }>(
      'POST',
      '/v2/users/human',
      cuerpo,
    );
    if (!res.userId) {
      throw new ServiceUnavailableException(
        'ZITADEL no devolvió el id del usuario creado',
      );
    }
    return res.userId;
  }

  /**
   * Fija la contraseña de un usuario con privilegio de administrador.
   *
   * **No comprueba la contraseña actual, y no puede.** Comprobado contra la
   * instancia el 2026-08-08: llamando con el token de la cuenta de servicio,
   * ZITADEL acepta el cambio aunque `verification.currentPassword` sea
   * incorrecta —devuelve 200 y la contraseña cambia de verdad—. El privilegio
   * de administrador se salta esa verificación.
   *
   * Por eso, para el cambio que hace un usuario sobre SU propia cuenta, hay que
   * verificar antes la actual con `verificarCredenciales()`, que sí la aplica.
   * Delegarla aquí dejaría cambiar la contraseña sin conocer la anterior.
   */
  async establecerContrasena(userId: string, nueva: string): Promise<void> {
    await this.peticion('POST', `/v2/users/${userId}/password`, {
      newPassword: { password: nueva, changeRequired: false },
    });
  }

  /**
   * Marca el correo como verificado.
   *
   * Se usa la forma administrativa (`isVerified: true`) y NO el flujo de código
   * de ZITADEL, por lo mismo que en `establecerContrasena`: con token de cuenta
   * de servicio no valida el código. Quien comprueba el código es Ruteo, en
   * `CredentialsService`; aquí solo se refleja el resultado.
   */
  async marcarCorreoVerificado(userId: string, email: string): Promise<void> {
    // Se usa la API v1 y no `POST /v2/users/{id}/email`: la v2 rechaza con
    // "Email not changed" cuando el correo es idéntico, que es justo el caso
    // aquí —solo se quiere cambiar la marca de verificado, no la dirección—.
    // Comprobado el 2026-08-08: la v2 devuelve 400 y la v1 deja `isVerified`
    // en true.
    await this.peticion('PUT', `/management/v1/users/${userId}/email`, {
      email,
      isEmailVerified: true,
    });
  }

  /** Baja de un usuario. Se usa para compensar altas a medias. */
  async borrarUsuario(userId: string): Promise<void> {
    await this.peticion('DELETE', `/v2/users/${userId}`);
  }

  private async cerrarSesion(id: string, sessionToken: string): Promise<void> {
    try {
      await this.peticion('DELETE', `/v2/sessions/${id}`, { sessionToken });
    } catch (e) {
      this.log.warn(
        `No se pudo cerrar la sesión ${id} en ZITADEL: ${String(e)}`,
      );
    }
  }

  private async peticion<T>(
    metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    ruta: string,
    cuerpo?: unknown,
    opciones?: { tratar404ComoCredencial?: boolean },
  ): Promise<T> {
    // Fuera del `try`: si falta la cuenta de servicio es un fallo de
    // despliegue, y dejarlo caer en el `catch` de red lo registraba como
    // "ZITADEL inalcanzable", que manda a depurar la conexión equivocada.
    const autorizacion = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(`${this.issuer}${ruta}`, {
        method: metodo,
        headers: {
          Authorization: autorizacion,
          'Content-Type': 'application/json',
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
    } catch (e) {
      // Instancia caída o sin red. NO es un fallo de credenciales: devolverlo
      // como 401 haría que una caída de ZITADEL se leyera en los registros como
      // una oleada de contraseñas mal puestas.
      this.log.error(`ZITADEL inalcanzable (${metodo} ${ruta}): ${String(e)}`);
      throw new ServiceUnavailableException(
        'El proveedor de identidad no responde',
      );
    }

    if (res.ok) {
      if (res.status === 204) return {} as T;
      return (await res.json()) as T;
    }

    const detalle = await res.text().catch(() => '');

    // ZITADEL devuelve **400** cuando la contraseña no cuadra, no 401
    // —comprobado el 2026-08-08: `{"code":3,"message":"Password is invalid",
    // "details":[{"@type":".../CredentialsCheckError",...}]}`—. Sin mirar el
    // cuerpo, un fallo de login normal salía como 503.
    //
    // Se exige la marca `CredentialsCheckError` y no basta con el 400 a secas:
    // un 400 por petición mal formada es un fallo NUESTRO, y esconderlo detrás
    // de "credenciales inválidas" haría imposible depurarlo.
    const credencial =
      res.status === 401 ||
      res.status === 403 ||
      (res.status === 400 && detalle.includes('CredentialsCheckError')) ||
      (res.status === 404 && opciones?.tratar404ComoCredencial);
    if (credencial) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.log.error(
      `ZITADEL respondió ${res.status} a ${metodo} ${ruta}: ${detalle.slice(0, 300)}`,
    );
    throw new ServiceUnavailableException(
      'El proveedor de identidad devolvió un error',
    );
  }
}
