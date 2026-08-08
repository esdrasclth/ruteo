import { SetMetadata } from '@nestjs/common';
import { TenantModule } from '@prisma/client';

export const MODULO_KEY = 'modulo';

/**
 * Marca un controlador como perteneciente a un módulo activable.
 *
 * Se pone a nivel de CONTROLADOR y no de endpoint: si un módulo está apagado,
 * lo está entero. Dejar la mitad de sus rutas vivas es la clase de agujero que
 * aparece al añadir un endpoint nuevo y olvidar el decorador.
 */
export const Modulo = (modulo: TenantModule) => SetMetadata(MODULO_KEY, modulo);
