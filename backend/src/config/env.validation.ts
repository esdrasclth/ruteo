import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL_APP: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_TTL: string;

  // Secreto de los tokens del panel de plataforma. DISTINTO del de tenant: con
  // uno compartido, quien pudiera falsificar un token de empresa falsificaría
  // también uno que ve todas.
  @IsString()
  @IsNotEmpty()
  PLATFORM_JWT_SECRET: string;

  // --- Identidad (ZITADEL) --------------------------------------------------
  // Las credenciales viven en ZITADEL; este backend sigue emitiendo su token de
  // sesión con `tid`, que es de lo que depende el RLS. No hay ruta alternativa:
  // sin estos valores la aplicación no puede autenticar a nadie, así que se
  // exigen al arrancar en vez de fallar en el primer login.
  @IsString()
  @IsNotEmpty()
  ZITADEL_ISSUER: string;

  // Cuenta de servicio con permisos de Management API: crea sesiones, verifica
  // contraseñas y da de alta usuarios.
  @IsString()
  @IsNotEmpty()
  ZITADEL_SERVICE_TOKEN: string;

  // Proyecto cuyos roles se mapean a los `Role` de Ruteo.
  @IsOptional()
  @IsString()
  ZITADEL_PROJECT_ID: string = '';

  // --- Correo saliente ------------------------------------------------------
  // Con clave, los códigos de restablecimiento y verificación se envían de
  // verdad por Resend. Sin clave se registran en el log, que permite probar el
  // flujo entero en local sin mandar correo a nadie.
  @IsOptional()
  @IsString()
  RESEND_API_KEY: string = '';

  @IsOptional()
  @IsString()
  MAIL_FROM: string = 'Ruteo <no-reply@brandsofts.com>';

  // URL del PANEL (proyecto `frontend`). Se usa para armar el enlace de
  // verificación que viaja en el correo. Es distinta de `PUBLIC_APP_URL`, que
  // apunta al backend y sirve para las etiquetas QR de rastreo.
  @IsOptional()
  @IsString()
  PANEL_URL: string = 'http://localhost:3001';

  // Base URL used to build public tracking links (QR labels).
  @IsOptional()
  @IsString()
  PUBLIC_APP_URL: string = 'http://localhost:3000';

  // Geocodificación (OpenStreetMap). Apuntar a una instancia propia si algún
  // día el volumen supera lo que permite la política de uso pública.
  @IsOptional()
  @IsString()
  NOMINATIM_URL: string = 'https://nominatim.openstreetmap.org';

  // Nominatim exige identificar la aplicación en cada petición.
  @IsOptional()
  @IsString()
  NOMINATIM_USER_AGENT: string =
    'Ruteo/1.0 (logistica; contacto: soporte@ruteo.app)';

  // Motor de rutas por carretera (contenedor `osrm` del docker-compose).
  // Si no está levantado, el panel cae a líneas rectas sin romperse.
  @IsOptional()
  @IsString()
  OSRM_URL: string = 'http://localhost:5100';

  @IsOptional()
  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsOptional()
  @IsNumber()
  REDIS_PORT: number = 6379;

  // Namespace de las colas BullMQ en Redis; permite que varios entornos
  // compartan la misma instancia sin pisarse los jobs.
  @IsOptional()
  @IsString()
  QUEUE_PREFIX: string = 'bull';

  // Allowed CORS origin for the web panel.
  @IsOptional()
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3001';
}

export function validateEnv(config: Record<string, unknown>) {
  // `config` solo trae lo que se leyó del archivo `.env`. El objeto validado que
  // devolvemos tiene prioridad en `ConfigService`, así que si no mezclamos aquí
  // las variables de entorno reales, sus valores quedan tapados por los
  // defaults de esta clase: en Docker/CI —donde se configura por entorno y no
  // por archivo— la app arrancaría con PORT 3000 y el CORS apuntando a
  // localhost sin avisar de nada.
  //
  // El entorno real gana sobre el archivo, que es el orden de 12-factor y el
  // mismo que aplica dotenv al cargar `.env`.
  const merged: Record<string, unknown> = { ...config, ...process.env };

  const validated = plainToInstance(EnvironmentVariables, merged, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validated;
}
