import { lookup } from 'node:dns/promises';
import { request as peticionHttps } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

/**
 * Comprobación de que un webhook apunta a internet y no a nuestra propia red.
 *
 * El endpoint lo elige el TENANT, así que la URL es entrada de un tercero y el
 * backend es quien hace la petición. Sin este filtro, cualquier cliente puede
 * registrar `http://169.254.169.254/latest/meta-data/` y usar nuestro servidor
 * como puente hacia el metadata del proveedor de nube, hacia Redis, hacia
 * Postgres o hacia el propio panel de plataforma. Es SSRF de manual.
 *
 * Se comprueba en DOS momentos y a propósito:
 *
 *  1. Al crear o actualizar el endpoint, para dar un error que el usuario pueda
 *     entender y corregir en el momento.
 *  2. Antes de CADA entrega, porque entre el alta y el envío el dominio puede
 *     cambiar de IP. Validar solo al crear deja abierto el DNS rebinding:
 *     registras `mi-dominio.com` apuntando a una IP pública, pasa la
 *     validación, y luego lo repuntas a 127.0.0.1.
 *
 * Y la entrega se hace con `enviarAlDestino`, que conecta contra la IP que
 * acaba de validarse. Comprobar y luego llamar a `fetch(url)` NO cierra el
 * agujero: `fetch` resuelve el nombre por su cuenta, así que entre la
 * comprobación y la conexión hay una segunda resolución que el dueño del
 * dominio controla. Con un TTL de 0 y dos registros que se alternan, esa
 * ventana se gana a la primera. Validar una dirección y conectarse a otra es
 * no haber validado nada.
 */

/** Rangos que nunca deben ser destino de un webhook. */
function esPrivada(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || // "esta red"
      a === 10 || // privada
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local: el metadata de la nube vive aquí
      (a === 172 && b >= 16 && b <= 31) || // privada
      (a === 192 && b === 168) || // privada
      (a === 192 && b === 0) || // IETF
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast y reservados
    );
  }

  const v6 = ip.toLowerCase().split('%')[0];
  if (v6 === '::1' || v6 === '::') return true;
  // fc00::/7 (únicas locales) y fe80::/10 (enlace local).
  if (/^f[cd]/.test(v6)) return true;
  if (/^fe[89ab]/.test(v6)) return true;
  // IPv4 mapeada a IPv6 (::ffff:127.0.0.1): se valida la parte IPv4.
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapeada) return esPrivada(mapeada[1]);
  return false;
}

export class DestinoNoPermitido extends Error {}

/**
 * Destino ya comprobado, listo para conectarse.
 *
 * `ip` es la dirección concreta que se validó y contra la que hay que abrir la
 * conexión. Es `null` solo en el modo de desarrollo (`permitirPrivados`), donde
 * no se valida nada y por tanto no hay nada que fijar.
 */
export interface DestinoValidado {
  ip: string | null;
  familia: 4 | 6;
}

/**
 * Valida la URL de un webhook y devuelve la dirección verificada. Lanza
 * `DestinoNoPermitido` con un motivo legible si no sirve.
 *
 * Devolver la IP no es un detalle de comodidad: es lo que permite que quien
 * entrega se conecte exactamente a lo que se comprobó, en vez de resolver el
 * nombre otra vez y arriesgarse a que haya cambiado.
 *
 * `permitirPrivados` existe solo para desarrollo (probar contra un servidor
 * local). Lo activa `WEBHOOKS_PERMITIR_DESTINOS_PRIVADOS`, que en producción
 * debe quedarse en `false`.
 */
export async function validarDestinoWebhook(
  url: string,
  permitirPrivados = false,
): Promise<DestinoValidado> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DestinoNoPermitido('La URL del webhook no es válida.');
  }

  if (permitirPrivados) return { ip: null, familia: 4 };

  // Solo HTTPS: el cuerpo lleva datos de envíos y va firmado, pero la firma no
  // cifra nada. En texto plano cualquiera en el camino lee los datos del
  // cliente final.
  if (parsed.protocol !== 'https:') {
    throw new DestinoNoPermitido(
      'El webhook debe usar https:// para que los datos no viajen en claro.',
    );
  }

  // Puertos raros suelen significar un servicio interno, no un receptor de
  // webhooks. Un endpoint legítimo escucha donde escucha la web.
  const puerto = parsed.port ? Number(parsed.port) : 443;
  if (puerto !== 443 && puerto !== 8443) {
    throw new DestinoNoPermitido(
      'El webhook debe apuntar al puerto 443 (o 8443).',
    );
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  // Un host escrito directamente como IP se comprueba tal cual; si no, se
  // resuelve. `all: true` porque un dominio puede devolver varias direcciones y
  // basta con que UNA sea interna para que el destino no sirva.
  const direcciones = isIP(host)
    ? [host]
    : await lookup(host, { all: true, verbatim: true })
        .then((rs) => rs.map((r) => r.address))
        .catch(() => {
          throw new DestinoNoPermitido(
            `No se pudo resolver el dominio "${host}".`,
          );
        });

  if (direcciones.length === 0) {
    throw new DestinoNoPermitido(`No se pudo resolver el dominio "${host}".`);
  }
  if (direcciones.some(esPrivada)) {
    throw new DestinoNoPermitido(
      'El webhook apunta a una dirección de red interna y no se permite.',
    );
  }

  // Se fija la PRIMERA, que es también la que habría elegido el sistema. Todas
  // pasaron el filtro —basta con que una sea interna para rechazar el destino
  // entero—, así que cualquiera valdría; lo que importa es comprometerse con
  // una y no volver a preguntar.
  const elegida = direcciones[0];
  return { ip: elegida, familia: isIP(elegida) === 6 ? 6 : 4 };
}

/** Lo que la entrega necesita saber de la respuesta. El cuerpo se descarta. */
export interface RespuestaDestino {
  status: number;
}

export interface OpcionesEnvio {
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

/**
 * Entrega el cuerpo al destino **conectándose a la IP ya validada**.
 *
 * Se usa `https.request` y no `fetch` porque es el único de los dos que deja
 * sustituir la resolución de nombres: con `lookup` se le dice al socket a qué
 * dirección ir, mientras el `hostname` de la URL se mantiene intacto para el
 * SNI de TLS, la validación del certificado y la cabecera `Host`. Es decir, el
 * receptor ve exactamente la misma petición que vería con `fetch`; lo único que
 * cambia es que no hay una segunda consulta al DNS que alguien pueda torcer.
 *
 * `https.request` tampoco sigue redirecciones, que era el otro motivo por el
 * que `fetch` necesitaba `redirect: 'manual'`.
 */
export function enviarAlDestino(
  url: string,
  destino: DestinoValidado,
  opciones: OpcionesEnvio,
): Promise<RespuestaDestino> {
  // Sin IP fijada (solo desarrollo) no hay nada que fijar: se va por el camino
  // normal, que además admite http:// para probar contra un servidor local.
  if (destino.ip === null) {
    return fetch(url, {
      method: 'POST',
      headers: opciones.headers,
      body: opciones.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(opciones.timeoutMs),
    }).then((res) => ({ status: res.status }));
  }

  const parsed = new URL(url);
  const ip = destino.ip;
  const familia = destino.familia;

  // `all` lo pide el socket cuando quiere la lista entera; hay que responder en
  // la forma que espera o la conexión falla con un error que no dice nada.
  const lookupFijado: LookupFunction = (_host, opts, callback) => {
    if (opts.all) {
      callback(null, [{ address: ip, family: familia }]);
    } else {
      callback(null, ip, familia);
    }
  };

  return new Promise<RespuestaDestino>((resolve, reject) => {
    const req = peticionHttps(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: opciones.headers,
        lookup: lookupFijado,
        // Sin agente compartido: el conjunto de sockets reutilizables se indexa
        // por host y puerto, no por la función de resolución, y no conviene que
        // una entrega herede la conexión que abrió otra.
        agent: false,
      },
      (res) => {
        // El cuerpo de la respuesta no se usa, pero hay que consumirlo o el
        // socket se queda abierto hasta que venza el tiempo.
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      },
    );

    req.setTimeout(opciones.timeoutMs, () => {
      req.destroy(
        new Error(`Tiempo de espera agotado (${opciones.timeoutMs} ms)`),
      );
    });
    req.on('error', reject);
    req.end(opciones.body);
  });
}
