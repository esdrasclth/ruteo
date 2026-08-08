import { SetMetadata } from '@nestjs/common';

export const VERIFIED_EMAIL_KEY = 'verifiedEmail';

/**
 * Exige que el actor tenga el correo verificado.
 *
 * Se pone SOLO en acciones donde un correo sin probar es un riesgo real:
 * emitir credenciales (invitar gente, crear llaves de API) y recuperar la
 * cuenta. La operación diaria —envíos, rutas, clientes, cobros— NO se toca:
 * bloquear el trabajo de una empresa por un correo pendiente es castigar al
 * cliente por un trámite, y es lo que hace que la gente abandone antes de
 * probar el producto.
 */
export const RequiereCorreoVerificado = () =>
  SetMetadata(VERIFIED_EMAIL_KEY, true);
