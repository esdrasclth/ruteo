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

  // Vacía en local (el contenedor arranca sin `--requirepass`). En producción
  // la exige `comprobarSecretosDeProduccion`: Redis guarda los bloqueos de
  // sesión y las colas, así que un Redis abierto es un problema de seguridad,
  // no solo de datos.
  @IsOptional()
  @IsString()
  REDIS_PASSWORD: string = '';

  // Namespace de las colas BullMQ en Redis; permite que varios entornos
  // compartan la misma instancia sin pisarse los jobs.
  @IsOptional()
  @IsString()
  QUEUE_PREFIX: string = 'bull';

  // --- Almacenamiento de archivos (S3 / MinIO) ------------------------------
  // Fotos de bodega, facturas, declaraciones, firmas de entrega y evidencia de
  // reclamos. Opcional a propósito: sin configurar, el módulo queda dormido y
  // se puede trabajar en local sin levantar un MinIO. Lo que NO se admite es
  // configurarlo a medias, y de eso se encarga `comprobarAlmacenamiento`.
  //
  // El endpoint es la API S3 (`https://s3.…`), NO la consola web (`storage.…`),
  // que es una aplicación distinta en otro puerto. Apuntar a la consola da un
  // error de XML mal formado que no señala a ningún sitio.
  @IsOptional()
  @IsString()
  S3_ENDPOINT: string = '';

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY: string = '';

  @IsOptional()
  @IsString()
  S3_SECRET_KEY: string = '';

  @IsOptional()
  @IsString()
  S3_BUCKET: string = '';

  @IsOptional()
  @IsString()
  S3_REGION: string = 'us-east-1';

  // MinIO sirve los buckets como ruta (`/bucket/clave`). Con esto en `false`,
  // el SDK busca `bucket.host`, que no resuelve.
  @IsOptional()
  @IsString()
  S3_FORCE_PATH_STYLE: string = 'true';

  // Dominio para SERVIR archivos al navegador. Se separa del endpoint de la API
  // porque son dos usos distintos del mismo almacenamiento: uno lo consume el
  // backend para firmar, el otro lo consume el navegador para descargar, y al
  // segundo se le puede poner caché o CDN delante sin tocar el primero.
  @IsOptional()
  @IsString()
  S3_PUBLIC_URL: string = '';

  // Origen del panel RAÍZ: la única pantalla sin tenant todavía (el alta).
  @IsOptional()
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3001';

  // Plantilla del panel de cada empresa. El `{slug}` se sustituye por el de la
  // empresa, tanto para los enlaces de los correos como para decidir qué
  // orígenes acepta el CORS.
  //
  // Lleva el esquema y el puerto dentro a propósito: con piezas sueltas harían
  // falta tres variables que solo tienen sentido juntas, y bastaría con que una
  // se quedara en su valor de desarrollo para que los correos de producción
  // salieran enlazando a `http://`.
  @IsOptional()
  @IsString()
  PANEL_TENANT_URL: string = 'http://{slug}.localhost:3001';
}

// Valores que vienen en `.env.example`. Copiar el archivo y desplegar sin
// cambiarlos es el error más fácil de cometer y el más caro: `PLATFORM_JWT_SECRET`
// firma el token que ve TODAS las empresas, y su ejemplo lleva un número al
// final que lo hace parecer generado.
const SECRETOS_DE_EJEMPLO = new Set([
  'change-me-access',
  'change-me-refresh',
  'cambiar-esto-plataforma-1739517683',
  'ruteo',
  'ruteo_app',
]);

// Mínimo para un secreto HMAC. 32 caracteres no es un número mágico del
// estándar; es el punto donde `openssl rand -base64 24` ya no cabe y obliga a
// generar en serio en vez de teclear algo.
const LARGO_MINIMO_SECRETO = 32;

/**
 * El almacenamiento se configura entero o no se configura.
 *
 * A medias es el peor de los tres estados: el módulo arranca creyéndose
 * apagado, las pantallas ofrecen subir archivos y cada intento falla con
 * «no está configurado» en un entorno donde alguien SÍ puso las claves. Se
 * comprueba en todos los entornos, no solo en producción, porque el que se
 * configura a medias suele ser el de desarrollo.
 */
function comprobarAlmacenamiento(env: EnvironmentVariables): string[] {
  const piezas: [string, string][] = [
    ['S3_ENDPOINT', env.S3_ENDPOINT],
    ['S3_ACCESS_KEY', env.S3_ACCESS_KEY],
    ['S3_SECRET_KEY', env.S3_SECRET_KEY],
    ['S3_BUCKET', env.S3_BUCKET],
  ];
  const puestas = piezas.filter(([, v]) => v);
  if (puestas.length === 0) return [];

  const fallos: string[] = [];
  const faltan = piezas.filter(([, v]) => !v).map(([n]) => n);
  if (faltan.length > 0) {
    fallos.push(
      `El almacenamiento está configurado a medias. Falta: ${faltan.join(', ')}.`,
    );
  }

  // La consola web de MinIO y la API S3 son dos servicios distintos. Apuntar
  // aquí a la consola falla al primer intento de firmar, con un error de XML
  // que no menciona la palabra "consola" por ningún lado.
  if (env.S3_ENDPOINT && /(^|\/\/)storage\./.test(env.S3_ENDPOINT)) {
    fallos.push(
      `S3_ENDPOINT parece la consola web (${env.S3_ENDPOINT}), no la API S3. Usa el dominio de la API.`,
    );
  }

  if (
    env.NODE_ENV === NodeEnv.Production &&
    env.S3_ENDPOINT &&
    !env.S3_ENDPOINT.startsWith('https://')
  ) {
    fallos.push(
      'S3_ENDPOINT debe usar https:// en producción: por ahí viajan las claves firmadas.',
    );
  }

  return fallos;
}

/**
 * Comprobaciones que solo aplican con `NODE_ENV=production`.
 *
 * Se hacen al arrancar y no en el despliegue porque un checklist se olvida y
 * un arranque fallido no. Prefiere tirar el proceso a servir con la clave de
 * ejemplo: un backend caído se nota en minutos, un secreto público no se nota
 * hasta que alguien lo usa.
 */
function comprobarSecretosDeProduccion(env: EnvironmentVariables): string[] {
  if (env.NODE_ENV !== NodeEnv.Production) return [];

  const fallos: string[] = [];
  const secretos: [string, string][] = [
    ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
    ['PLATFORM_JWT_SECRET', env.PLATFORM_JWT_SECRET],
  ];

  for (const [nombre, valor] of secretos) {
    if (SECRETOS_DE_EJEMPLO.has(valor)) {
      fallos.push(
        `${nombre} sigue siendo el valor de ejemplo. Genera uno con: openssl rand -base64 48`,
      );
    } else if (valor.length < LARGO_MINIMO_SECRETO) {
      fallos.push(
        `${nombre} es demasiado corto (${valor.length} caracteres, mínimo ${LARGO_MINIMO_SECRETO}).`,
      );
    }
  }

  // Los tres secretos tienen que ser DISTINTOS entre sí. Compartir el de tenant
  // con el de plataforma anula la separación que sostiene el panel de
  // superadmin: quien falsifique un token de empresa falsifica el que las ve
  // todas.
  const unicos = new Set(secretos.map(([, v]) => v));
  if (unicos.size !== secretos.length) {
    fallos.push(
      'JWT_ACCESS_SECRET, JWT_REFRESH_SECRET y PLATFORM_JWT_SECRET deben ser distintos entre sí.',
    );
  }

  if (!env.REDIS_PASSWORD) {
    fallos.push(
      'REDIS_PASSWORD es obligatoria en producción: Redis guarda los bloqueos de sesión y las colas.',
    );
  }

  // Sin el marcador, `urlDeTenant` devuelve la plantilla tal cual y TODAS las
  // empresas reciben la misma URL en sus correos. No rompe nada al arrancar:
  // se descubre cuando un usuario pulsa el enlace de verificación y aterriza en
  // el panel de otra empresa.
  if (!env.PANEL_TENANT_URL.includes('{slug}')) {
    fallos.push(
      'PANEL_TENANT_URL debe llevar el marcador {slug} (ej. https://{slug}.ruteo.example).',
    );
  }

  // El mismo valor decide qué orígenes acepta el CORS. Con `http://`, cualquier
  // subdominio servido en claro pasaría a ser un origen de confianza.
  if (!env.PANEL_TENANT_URL.startsWith('https://')) {
    fallos.push('PANEL_TENANT_URL debe usar https:// en producción.');
  }
  if (!env.CORS_ORIGIN.startsWith('https://')) {
    fallos.push('CORS_ORIGIN debe usar https:// en producción.');
  }

  // La contraseña por defecto del rol de aplicación la fija la migración
  // `20260712203500_rls_setup`, que la deja en `ruteo_app`. En un despliegue
  // nuevo sobrevive tal cual si nadie la rota.
  for (const [nombre, url] of [
    ['DATABASE_URL', env.DATABASE_URL],
    ['DATABASE_URL_APP', env.DATABASE_URL_APP],
  ] as const) {
    if (/:\/\/(ruteo|ruteo_app):(ruteo|ruteo_app)@/.test(url)) {
      fallos.push(
        `${nombre} usa la contraseña por defecto. Rótala con ALTER ROLE y actualiza la cadena.`,
      );
    }
  }

  return fallos;
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

  // Va DESPUÉS de la validación de forma: sin ella los campos podrían no ser
  // ni siquiera cadenas y las comprobaciones de abajo mentirían.
  const inseguros = [
    ...comprobarSecretosDeProduccion(validated),
    ...comprobarAlmacenamiento(validated),
  ];
  if (inseguros.length > 0) {
    throw new Error(
      `Configuración insegura para producción:\n${inseguros
        .map((f) => `  - ${f}`)
        .join('\n')}`,
    );
  }

  return validated;
}
