import { StorageService } from './storage.service';

/**
 * Convierte las claves de una prueba de entrega en URLs que el navegador pueda
 * abrir.
 *
 * La firma se hace AL LEER y no se guarda en ninguna parte: una URL firmada es
 * una credencial portátil —quien la tenga ve el archivo, sin sesión— así que
 * guardarla en la base sería dejar escrito un pase permanente. Firmar cuesta
 * criptografía local, sin red, así que hacerlo en cada lectura no se nota.
 *
 * El nombre del campo que sale sigue siendo `signatureUrl`/`photoUrl`: lo que
 * cambió es qué se guarda, no lo que consume el panel.
 */

/** Lo mínimo que necesita esta función de un POD. */
export interface PodConClaves {
  signatureKey: string | null;
  photoKey: string | null;
}

export interface PodFirmado {
  signatureUrl: string | null;
  photoUrl: string | null;
}

/**
 * Datos anteriores al cambio de columnas: si el valor ya es una URL completa,
 * se devuelve tal cual. Intentar firmarlo como si fuera una clave daría un
 * enlace roto, y el archivo viejo dejaría de verse por un detalle de migración.
 */
function esUrlCompleta(valor: string): boolean {
  return valor.startsWith('http://') || valor.startsWith('https://');
}

async function firmar(
  storage: StorageService,
  clave: string | null,
  tenantId: string,
): Promise<string | null> {
  if (!clave) return null;
  if (esUrlCompleta(clave)) return clave;
  try {
    return await storage.firmarDescarga(clave, tenantId);
  } catch {
    // Un archivo que no se puede firmar —almacenamiento apagado, clave de otra
    // empresa— no debe tumbar la pantalla entera de una ruta con veinte
    // paradas. Se devuelve sin enlace, que es exactamente lo que el usuario
    // percibe: esa evidencia no está disponible.
    return null;
  }
}

/** Añade `signatureUrl`/`photoUrl` firmados a un POD. */
export async function firmarPod<T extends PodConClaves>(
  storage: StorageService,
  pod: T | null,
  tenantId: string,
): Promise<(T & PodFirmado) | null> {
  if (!pod) return null;
  const [signatureUrl, photoUrl] = await Promise.all([
    firmar(storage, pod.signatureKey, tenantId),
    firmar(storage, pod.photoKey, tenantId),
  ]);
  return { ...pod, signatureUrl, photoUrl };
}

/**
 * Lo mismo para una lista suelta de cosas con claves: los intentos de entrega.
 *
 * Cada intento guarda su propia evidencia, así que una parada con tres intentos
 * tiene tres fotos distintas y no una. Firmarlas con la misma función que el
 * POD no es reaprovechar por reaprovechar: es que la regla —guardar clave,
 * firmar al leer, no romperse si el almacenamiento no responde— tiene que ser
 * idéntica en los dos sitios, o la evidencia se comportaría distinto según por
 * qué pantalla se mire.
 */
export async function firmarConClaves<T extends PodConClaves>(
  storage: StorageService,
  elementos: T[],
  tenantId: string,
): Promise<(T & PodFirmado)[]> {
  return Promise.all(
    elementos.map(
      async (elemento) =>
        (await firmarPod(storage, elemento, tenantId)) as T & PodFirmado,
    ),
  );
}

/**
 * Lo mismo para una lista de paradas. Va en paralelo porque firmar no toca la
 * red: veinte paradas son cuarenta firmas locales, no cuarenta peticiones.
 */
export async function firmarPodsDeParadas<
  P extends PodConClaves,
  T extends { pod: P | null },
>(
  storage: StorageService,
  paradas: T[],
  tenantId: string,
): Promise<(Omit<T, 'pod'> & { pod: (P & PodFirmado) | null })[]> {
  return Promise.all(
    paradas.map(async (parada) => ({
      ...parada,
      pod: await firmarPod(storage, parada.pod, tenantId),
    })),
  );
}
