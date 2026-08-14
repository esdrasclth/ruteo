import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Categoria,
  claveDe,
  esDelTenant,
  prefijoDe,
  prefijoDeTenant,
} from './claves';

/**
 * Almacenamiento de archivos sobre S3 (aquí, MinIO).
 *
 * **Los binarios no pasan por el backend.** El navegador sube directo al
 * almacenamiento con una URL firmada, y descarga igual. Hacer de proxy de un
 * archivo obliga a este proceso a sostener la subida entera en memoria o en
 * disco, y una bodega subiendo doce fotos por bulto tumbaría el backend antes
 * que al almacenamiento. Firmar cuesta microsegundos y no toca la red.
 *
 * **Falla CERRADO, al revés que `RedisService`.** Redis puede caerse y la
 * aplicación sigue: la caché falla, los frenos degradan a memoria. Aquí no hay
 * degradación posible. Si el almacenamiento no responde, decir «subido» sin
 * haber subido nada deja una fila en la base apuntando a un objeto que no
 * existe, y eso no se descubre hasta el día que alguien abre un reclamo y la
 * foto no está. Mejor un error ahora.
 */

/**
 * Cuánto vive una URL de subida. Suficiente para una foto desde el móvil de un
 * operador en una bodega con mala cobertura, y poco para que la URL sirva de
 * algo si acaba en un registro o en el historial del navegador.
 */
const VIGENCIA_SUBIDA_S = 15 * 60;

/**
 * Cuánto vive una URL de descarga. Más corta: se pide justo antes de mostrar el
 * archivo, no se guarda en ningún sitio. Una URL firmada es una credencial
 * portátil —quien la tenga entra, sin sesión ni permisos—, así que dura lo que
 * tarda el navegador en cargar la imagen.
 */
const VIGENCIA_DESCARGA_S = 5 * 60;

/**
 * Tope de tamaño que se firma. Va aquí y no solo en el navegador, porque la
 * comprobación del navegador la salta cualquiera que use la URL firmada a mano.
 */
const MAX_BYTES = 25 * 1024 * 1024;

/** Lo que se acepta subir. Lista cerrada: nada de ejecutables ni de comodines. */
const TIPOS_PERMITIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

export interface SolicitudDeSubida {
  tenantId: string;
  categoria: Categoria;
  propietarioId: string;
  nombreOriginal?: string;
  contentType: string;
  sizeBytes: number;
}

export interface SubidaFirmada {
  /** A dónde hace PUT el navegador. */
  url: string;
  /** La clave definitiva; es lo que se guarda en la base. */
  clave: string;
  expiraEn: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucket = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get<string>('S3_ENDPOINT', '');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY', '');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY', '');
    this.bucket = this.config.get<string>('S3_BUCKET', '');

    // Sin configuración el módulo queda dormido en vez de tumbar el arranque:
    // en local se puede trabajar en cualquier otra cosa sin levantar un MinIO.
    // Quien intente usarlo se encuentra un error que dice exactamente qué falta.
    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.log.warn(
        'Almacenamiento sin configurar (S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET): las subidas fallarán.',
      );
      return;
    }

    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      credentials: { accessKeyId, secretAccessKey },
      // **Sin esto, el SDK mete un checksum MENTIROSO en la URL firmada.**
      //
      // Desde la versión 3.729 el SDK calcula un CRC32 del cuerpo por defecto.
      // Al FIRMAR no hay cuerpo todavía, así que calcula el del vacío y lo deja
      // en la URL: `x-amz-checksum-crc32=AAAAAA==`. Después el navegador sube un
      // archivo real, cuyo CRC32 no es ese, y el servidor puede rechazarlo con
      // un 403 —según versión e implementación de S3—.
      //
      // Es un parámetro que además no sirve para nada aquí: no protege la
      // subida, porque describe un cuerpo que nunca se va a enviar. Quitarlo no
      // pierde ninguna comprobación; lo que de verdad acota la subida son el
      // `content-type` y el `content-length` firmados.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      // MinIO sirve los buckets como RUTA (`/bucket/clave`) y no como
      // subdominio (`bucket.host/clave`), que es lo que AWS hace por defecto.
      // Sin esto el SDK resuelve `ruteo.s3.brandsofts.com`, que no existe, y el
      // error que sale es de DNS: no señala en absoluto a esta opción.
      forcePathStyle:
        this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') !== 'false',
    });
  }

  /** ¿Hay configuración? Distinto de que responda: ver `disponible()`. */
  configurado(): boolean {
    return this.client !== null;
  }

  /** ¿Responde el bucket? Para el healthcheck. */
  async disponible(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch (e) {
      this.log.warn(`Almacenamiento inalcanzable: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * URL firmada para que el navegador suba el archivo directamente.
   *
   * El tipo y el tamaño se validan ANTES de firmar. Una vez firmada la URL, la
   * subida ya no pasa por aquí y no hay dónde comprobar nada.
   */
  async firmarSubida(solicitud: SolicitudDeSubida): Promise<SubidaFirmada> {
    const client = this.exigirCliente();

    if (!TIPOS_PERMITIDOS.has(solicitud.contentType)) {
      throw new ForbiddenException(
        `Tipo de archivo no permitido: ${solicitud.contentType}`,
      );
    }
    if (solicitud.sizeBytes <= 0 || solicitud.sizeBytes > MAX_BYTES) {
      throw new ForbiddenException(
        `El archivo supera el máximo de ${MAX_BYTES / 1024 / 1024} MB`,
      );
    }

    const clave = claveDe({
      tenantId: solicitud.tenantId,
      categoria: solicitud.categoria,
      propietarioId: solicitud.propietarioId,
      nombreOriginal: solicitud.nombreOriginal,
    });

    // `signableHeaders` NO es opcional, y esto está comprobado contra el MinIO
    // real, no deducido de la documentación.
    //
    // Sin esa opción, el SDK firma `content-length;host` y deja `content-type`
    // FUERA: pasarle `ContentType` al comando lo mete en la petición pero no en
    // la firma, así que la URL se podía usar para subir cualquier cosa con
    // cualquier tipo —comprobado: un PUT con `text/plain` sobre una URL firmada
    // para `image/jpeg` devolvía 200 y el objeto quedaba guardado como texto—.
    // Eso convierte «URL para subir una foto» en «URL para subir lo que sea»,
    // que es un alojamiento de archivos abierto durante quince minutos.
    //
    // Con los dos nombrados aquí, `SignedHeaders` pasa a
    // `content-length;content-type;host` y ambos se rechazan con 403 si no
    // coinciden. El tamaño ya se aplicaba por defecto; el tipo no.
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        ContentType: solicitud.contentType,
        ContentLength: solicitud.sizeBytes,
      }),
      {
        expiresIn: VIGENCIA_SUBIDA_S,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );

    return { url, clave, expiraEn: VIGENCIA_SUBIDA_S };
  }

  /**
   * URL firmada de lectura.
   *
   * Comprueba que la clave sea de esa empresa antes de firmar. El id del
   * archivo viaja en la petición y quien la manda lo controla; sin esta línea,
   * leer el documento de otra empresa sería cuestión de probar claves.
   */
  async firmarDescarga(clave: string, tenantId: string): Promise<string> {
    const client = this.exigirCliente();
    if (!esDelTenant(clave, tenantId)) {
      throw new ForbiddenException('El archivo no pertenece a esta empresa');
    }
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: clave }),
      { expiresIn: VIGENCIA_DESCARGA_S },
    );
  }

  /**
   * ¿Existe de verdad el objeto, y cuánto ocupa?
   *
   * Se llama al confirmar una subida, antes de escribir la fila. La URL firmada
   * se entrega y después no se sabe qué pasó: el navegador pudo perder la
   * conexión a mitad. Sin esta comprobación quedan filas apuntando a objetos
   * que no llegaron a existir.
   */
  async comprobar(
    clave: string,
    tenantId: string,
  ): Promise<{ sizeBytes: number; contentType: string } | null> {
    const client = this.exigirCliente();
    if (!esDelTenant(clave, tenantId)) {
      throw new ForbiddenException('El archivo no pertenece a esta empresa');
    }
    try {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: clave }),
      );
      return {
        sizeBytes: res.ContentLength ?? 0,
        contentType: res.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  async borrar(clave: string, tenantId: string): Promise<void> {
    const client = this.exigirCliente();
    if (!esDelTenant(clave, tenantId)) {
      throw new ForbiddenException('El archivo no pertenece a esta empresa');
    }
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }),
    );
  }

  /**
   * Borra TODO lo de una empresa. Solo lo usa el borrado de empresa del panel
   * de plataforma.
   *
   * El almacenamiento de objetos no tiene claves foráneas: el `ON DELETE
   * CASCADE` de Postgres se lleva las filas que apuntan a los archivos, pero no
   * los archivos. Sin esto, borrar una empresa deja para siempre sus fotos de
   * entrega y sus facturas en el bucket —ocupando espacio pagado, sin nada que
   * las referencie y sin nadie que sepa de quién eran—. Es justo el vertedero
   * que la convención de claves existe para evitar (ver `claves.ts`).
   *
   * Se pagina a mano porque `ListObjectsV2` devuelve 1000 objetos como mucho:
   * una empresa con dos años de fotos tiene bastantes más, y quedarse con la
   * primera página habría dado un borrado que parece completo y no lo es.
   *
   * Devuelve cuántos borró, para poder dejarlo escrito en el registro de
   * plataforma: «se borró la empresa X y con ella 4.312 archivos» es
   * comprobable; «se borró la empresa X» no.
   */
  async borrarTodoDelTenant(tenantId: string): Promise<number> {
    const client = this.exigirCliente();
    const prefijo = prefijoDeTenant(tenantId);
    let token: string | undefined;
    let borrados = 0;

    do {
      const pagina = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefijo,
          ContinuationToken: token,
        }),
      );
      const claves = (pagina.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => Boolean(k));

      if (claves.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: claves.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        borrados += claves.length;
      }

      // El token de la página siguiente sale de ESTA respuesta. Se relee en
      // cada vuelta y no se guarda de antes: borrar objetos entre páginas
      // cambia lo que queda, y reutilizar un token viejo saltaría objetos.
      token = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
    } while (token);

    return borrados;
  }

  /** Lo que cuelga de una cosa: las fotos de un bulto, los papeles de un envío. */
  async listar(
    tenantId: string,
    categoria: Categoria,
    propietarioId: string,
  ): Promise<string[]> {
    const client = this.exigirCliente();
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefijoDe(tenantId, categoria, propietarioId),
      }),
    );
    return (res.Contents ?? []).map((o) => o.Key!).filter(Boolean);
  }

  private exigirCliente(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos no está configurado en este entorno.',
      );
    }
    return this.client;
  }
}
