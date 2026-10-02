import { applyDecorators } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { IsString, ValidateBy } from 'class-validator';

// Contraseñas de usuarios del panel y de superadmins.
//
// Viven en Postgres como hash bcrypt (`users.password_hash` y
// `platform_admins.password_hash`). Hasta el 2026-10-01 vivían en ZITADEL; se
// devolvieron aquí para no depender de un proveedor externo para algo que solo
// hacía una cosa: decir si la contraseña cuadra. El token de sesión siempre lo
// emitió Ruteo, así que sesiones, roles y RLS no cambiaron.

// Coste 12: ~250 ms por comprobación. Lo bastante caro para que un volcado de
// la tabla no se recorra con diccionario, y lo bastante barato para el login.
const COSTE = 12;

// bcrypt solo mira los primeros 72 BYTES y trunca el resto en silencio. Se
// cuenta en bytes y no en caracteres: «ñ» o una tilde ocupan dos, y con
// `MaxLength(72)` una contraseña con acentos podía pasar la validación y luego
// valer igual que otra distinta a partir del byte 72.
const MAX_BYTES = 72;
const MIN_CARACTERES = 8;

/**
 * La misma política que aplicaba ZITADEL: 8+ caracteres con mayúscula,
 * minúscula, número y símbolo. Se conserva para que quitar el proveedor no
 * rebaje en silencio lo que se le exige a una contraseña nueva.
 *
 * Devuelve el motivo del rechazo, o `null` si cumple.
 */
export function incumplePolitica(contrasena: string): string | null {
  if (contrasena.length < MIN_CARACTERES) {
    return `La contraseña debe tener al menos ${MIN_CARACTERES} caracteres`;
  }
  if (Buffer.byteLength(contrasena, 'utf8') > MAX_BYTES) {
    return 'La contraseña es demasiado larga';
  }
  if (
    !/[A-Z]/.test(contrasena) ||
    !/[a-z]/.test(contrasena) ||
    !/[0-9]/.test(contrasena) ||
    !/[^A-Za-z0-9]/.test(contrasena)
  ) {
    return 'La contraseña debe incluir mayúscula, minúscula, número y símbolo';
  }
  return null;
}

/**
 * Validación de una contraseña NUEVA (alta, invitación, restablecimiento,
 * cambio). No se usa en el login: ahí se compara lo que llegue, y rechazar por
 * política una contraseña antigua que ya no la cumple dejaría fuera a su dueño.
 */
export function ContrasenaNueva(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    ValidateBy({
      name: 'contrasenaNueva',
      validator: {
        validate: (valor: unknown) =>
          typeof valor === 'string' && incumplePolitica(valor) === null,
        defaultMessage: (args) =>
          incumplePolitica(String(args?.value ?? '')) ?? 'Contraseña no válida',
      },
    }),
  );
}

export function hashearContrasena(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, COSTE);
}

// Hash de una contraseña que nadie conoce, para gastar el mismo tiempo cuando
// la cuenta no existe o no tiene contraseña. Sin esto, la respuesta rápida
// delataría qué correos están dados de alta.
let hashDeRelleno: Promise<string> | undefined;

/**
 * ¿Cuadra la contraseña con el hash? Sin hash —cuenta sin contraseña todavía,
 * como un invitado que no ha aceptado— responde `false` siempre, nunca `true`.
 */
export async function contrasenaCorrecta(
  contrasena: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    hashDeRelleno ??= bcrypt.hash('relleno-sin-cuenta', COSTE);
    await bcrypt.compare(contrasena, await hashDeRelleno);
    return false;
  }
  return bcrypt.compare(contrasena, hash);
}
