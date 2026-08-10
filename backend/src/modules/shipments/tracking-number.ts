import { randomInt } from 'crypto';

// Unambiguous alphabet (no 0/O/1/I) for human-readable, globally unique codes.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateTrackingNumber(): string {
  let body = '';
  for (let i = 0; i < 10; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `RUT-${body}`;
}

// Misma forma que produce el generador, que es la ÚNICA fuente de números de
// rastreo: no hay campo en el DTO de alta ni columna que se importe del CSV.
const FORMATO = new RegExp(`^RUT-[${ALPHABET}]{10}$`);

/**
 * ¿Tiene forma de número de rastreo?
 *
 * Sirve para descartar basura antes de tocar la base en los dos caminos
 * públicos —el endpoint de rastreo y la suscripción por WebSocket—, que son los
 * únicos que atiende cualquiera sin autenticarse. No es un control de acceso:
 * el número sigue siendo el secreto. Es evitar que una cadena arbitraria cueste
 * una consulta con joins, o cree una sala en el gateway.
 */
export function pareceNumeroDeRastreo(valor: string): boolean {
  return FORMATO.test(valor);
}
