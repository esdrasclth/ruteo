import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const CUALQUIER_ROL_KEY = 'cualquierRol';

/**
 * Roles que pueden ejecutar este endpoint.
 *
 * Con `RolesGuard` en la cadena, **declararlo es obligatorio**: un handler sin
 * `@Roles` ni `@CualquierRol` se rechaza. Ver el guard para el porqué.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Cualquier rol autenticado del tenant, a propósito.
 *
 * Es para lo que de verdad es de todos: ver la propia ficha, cambiarse la
 * contraseña, consultar el catálogo de planes. Se escribe explícitamente en vez
 * de dejarlo en blanco para que la diferencia entre "vale para todos" y "se me
 * olvidó" quede en el código y no en la cabeza de quien lo escribió.
 */
export const CualquierRol = () => SetMetadata(CUALQUIER_ROL_KEY, true);
