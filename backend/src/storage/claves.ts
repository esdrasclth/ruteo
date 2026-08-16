/**
 * Cómo se nombran los archivos dentro del bucket.
 *
 * Un bucket sin convención se convierte en un vertedero en tres meses: nadie
 * sabe de quién es un objeto, no se puede borrar una empresa entera, no se
 * pueden aplicar reglas de caducidad por tipo y no se puede saber cuánto ocupa
 * cada cliente. Por eso la clave NO se compone a mano en ningún sitio: se pide
 * a `claveDe()` y punto.
 *
 * La forma es:
 *
 *   t/{tenantId}/{categoria}/{propietarioId}/{uuid}.{ext}
 *
 * Ejemplo real:
 *
 *   t/9f3c…/fotos-paquete/1a2b…/7d8e9f10-….jpg
 *   t/9f3c…/documentos/4c5d…/a1b2c3d4-….pdf
 *   t/9f3c…/prueba-entrega/6e7f…/f0e1d2c3-….jpg
 *
 * **Por qué el tenant va PRIMERO y no en medio.** El almacenamiento de objetos
 * no tiene RLS: lo que en Postgres impide que una empresa vea las filas de otra
 * aquí no existe. Con el tenant como primer segmento, el aislamiento se puede
 * imponer donde sí se puede —políticas de bucket por prefijo, borrado de una
 * empresa con un solo `remove --recursive`, cuotas y facturación por prefijo—.
 * Con el tenant en medio, ninguna de esas cosas se puede expresar.
 *
 * **Por qué el nombre final es un UUID y no el nombre del archivo.** El nombre
 * que trae el usuario no es de fiar: trae acentos, espacios, emojis, barras y
 * `../`. Y dos personas subiendo `factura.pdf` al mismo envío se pisarían.
 * El nombre original se guarda como metadato en la base, que es donde se puede
 * mostrar sin que forme parte de una ruta.
 */

import { randomUUID } from 'crypto';

/**
 * Las carpetas que existen. Es un enum cerrado a propósito: si añadir un tipo
 * de archivo obliga a tocar esta lista, no aparecen carpetas inventadas en
 * producción que nadie sabe quién creó.
 *
 * Los nombres van en español y en minúscula con guiones, como el resto de lo
 * que se ve desde fuera del código.
 */
export const CATEGORIAS = {
  /** Fotos que toma el operador al recibir un bulto en bodega. */
  FOTOS_PAQUETE: 'fotos-paquete',
  /** Factura comercial, guía aérea, declaración, permisos. */
  DOCUMENTOS: 'documentos',
  /** Firma y foto de la entrega. */
  PRUEBA_ENTREGA: 'prueba-entrega',
  /** Evidencia de una excepción: faltantes, daños, diferencias de peso. */
  EXCEPCIONES: 'excepciones',
  /** Lo que adjunta un cliente al abrir un reclamo. */
  RECLAMOS: 'reclamos',
  /** Logotipo y demás material de marca de la empresa. */
  MARCA: 'marca',
  /**
   * Foto de perfil de una persona del equipo.
   *
   * El `propietarioId` es el id del usuario, así que cada uno tiene su carpeta
   * y reemplazar la foto no pisa la de nadie. Se firma sólo para uno mismo —ver
   * `UsersService`—, que es lo que hace que no exista la pregunta de si puedes
   * escribir en la carpeta de otro.
   */
  AVATARES: 'avatares',
} as const;

export type Categoria = (typeof CATEGORIAS)[keyof typeof CATEGORIAS];

export interface DatosDeClave {
  tenantId: string;
  categoria: Categoria;
  /**
   * A qué cuelga el archivo: el id del paquete, del envío, de la excepción.
   * Agrupa todo lo de una misma cosa en una carpeta, que es lo que hace que
   * buscar «las fotos de este bulto» sea listar un prefijo y no recorrer nada.
   */
  propietarioId: string;
  /** Nombre original, solo para deducir la extensión. */
  nombreOriginal?: string;
}

/**
 * Extensión en minúsculas y sin punto, o cadena vacía.
 *
 * Se acota a lo que parece una extensión de verdad. Un nombre como
 * `factura.pdf.exe.` o `foto.<script>` no debe poder colar nada en la ruta: la
 * clave la construimos nosotros, pero el trozo que viene de fuera se limpia
 * igual, porque el día que alguien reutilice esta función en otro contexto la
 * limpieza tiene que estar ya hecha.
 */
function extensionDe(nombre: string | undefined): string {
  if (!nombre) return '';
  const punto = nombre.lastIndexOf('.');
  if (punto <= 0 || punto === nombre.length - 1) return '';
  const ext = nombre.slice(punto + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

/** La clave de un objeto nuevo. Cada llamada devuelve una distinta. */
export function claveDe(datos: DatosDeClave): string {
  const ext = extensionDe(datos.nombreOriginal);
  const archivo = ext ? `${randomUUID()}.${ext}` : randomUUID();
  return `t/${datos.tenantId}/${datos.categoria}/${datos.propietarioId}/${archivo}`;
}

/** Prefijo de todo lo que cuelga de una cosa. Para listar o borrar en bloque. */
export function prefijoDe(
  tenantId: string,
  categoria: Categoria,
  propietarioId: string,
): string {
  return `t/${tenantId}/${categoria}/${propietarioId}/`;
}

/** Prefijo de una empresa entera. Para darla de baja o medir cuánto ocupa. */
export function prefijoDeTenant(tenantId: string): string {
  return `t/${tenantId}/`;
}

/**
 * ¿Esta clave pertenece a esta empresa?
 *
 * Se comprueba SIEMPRE antes de firmar una descarga. El id del objeto viaja en
 * la petición y quien la manda puede cambiarlo: sin esta comprobación, pedir el
 * archivo de otra empresa sería cuestión de probar identificadores. El RLS de
 * Postgres cubre la fila de metadatos, pero no el objeto que hay detrás.
 */
export function esDelTenant(clave: string, tenantId: string): boolean {
  return clave.startsWith(prefijoDeTenant(tenantId));
}
