import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { CUALQUIER_ROL_KEY, ROLES_KEY } from '../decorators/roles.decorator';
import type { PeticionHttp } from '../tipos-peticion';

/**
 * Comprueba el rol del actor. **Deniega por defecto.**
 *
 * Antes hacía `if (!required) return true`, y esa línea era el agujero: fallar
 * abierto convierte cada olvido en un permiso concedido, y en silencio. El repo
 * acabó con las ESCRITURAS declarando roles y casi ninguna LECTURA, así que
 * cualquier rol autenticado leía la agenda de clientes, los casilleros ajenos,
 * la caja del negocio y el tarifario. Los dos roles con menos privilegio de
 * diseño —`SUPPORT` y `CUSTOMER`, que no aparecían en ningún `@Roles`— eran los
 * que más alcance tenían en la práctica, precisamente por no aparecer.
 *
 * Ahora un handler sin `@Roles` ni `@CualquierRol` se rechaza. El fallo pasa a
 * ser visible el primer día en vez de invisible para siempre, y añadir un
 * endpoint obliga a decidir quién entra.
 *
 * Los controladores que NO montan este guard (rastreo público, autenticación,
 * panel de plataforma con su propio guard) no se ven afectados.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly log = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const abiertoATodos = this.reflector.getAllAndOverride<boolean>(
      CUALQUIER_ROL_KEY,
      [context.getHandler(), context.getClass()],
    );

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const user = context.switchToHttp().getRequest<PeticionHttp>().user;

    if (abiertoATodos) {
      // Sigue exigiendo sesión: "cualquier rol" son los del tenant, no el
      // público.
      if (!user) throw new ForbiddenException('Insufficient role');
      return true;
    }

    if (!required || required.length === 0) {
      // No es un 403 normal: es un endpoint mal declarado. Se registra en alto
      // porque desde fuera se ve igual que un permiso denegado, y sin esta
      // línea el fallo se diagnostica como "a este usuario le falta un rol".
      this.log.error(
        `${context.getClass().name}.${context.getHandler().name} no declara ` +
          '@Roles ni @CualquierRol; se deniega por defecto.',
      );
      throw new ForbiddenException('Insufficient role');
    }

    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
