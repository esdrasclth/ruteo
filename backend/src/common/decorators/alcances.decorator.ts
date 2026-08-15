import { SetMetadata } from '@nestjs/common';
import { ApiScope } from '@prisma/client';

export const ALCANCES_KEY = 'alcances';

/**
 * Alcances de llave de API que abren este endpoint. Basta con tener **uno**.
 *
 * Sólo lo mira `AlcancesGuard`, y sólo cuando la petición vino con
 * `x-api-key`: para una persona con sesión mandan los `@Roles` de siempre. Los
 * dos controles se suman, no se sustituyen —una llave sigue actuando como
 * `MERCHANT`, así que el alcance nunca concede lo que el rol no daba—.
 *
 * Poner `@Alcances` en un endpoint es la decisión de exponerlo a integraciones
 * externas. Un handler sin el decorador queda cerrado a las llaves aunque su
 * controlador acepte `x-api-key`, que es lo que mantiene la recepción de bodega
 * fuera del alcance de la web de un cliente sin tener que acordarse de ello.
 */
export const Alcances = (...alcances: ApiScope[]) =>
  SetMetadata(ALCANCES_KEY, alcances);
