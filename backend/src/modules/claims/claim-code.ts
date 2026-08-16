import { randomInt } from 'crypto';

// Mismo alfabeto sin caracteres ambiguos (sin 0/O/1/I) que los casilleros: un
// código de reclamo se dicta por teléfono, y «cero o be» es la llamada que hay
// que repetir.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Código visible de un reclamo, p. ej. «REC-7K2P9Q». */
export function generarCodigoReclamo(): string {
  let cuerpo = '';
  for (let i = 0; i < 6; i++) {
    cuerpo += ALFABETO[randomInt(ALFABETO.length)];
  }
  return `REC-${cuerpo}`;
}
