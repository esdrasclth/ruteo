import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { CUALQUIER_ROL_KEY, ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

// La regla que sostiene el control de acceso del panel. Antes fallaba ABIERTO,
// y como casi ninguna lectura declaraba roles, cualquier rol autenticado leía
// la agenda de clientes, los casilleros ajenos y la caja del negocio.

function contexto(user: { role: Role } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controlador {},
  } as unknown as ExecutionContext;
}

/** Reflector que responde lo que declararía cada decorador. */
function reflector(meta: { roles?: Role[]; cualquiera?: boolean }): Reflector {
  return {
    getAllAndOverride: (clave: string) =>
      clave === ROLES_KEY
        ? meta.roles
        : clave === CUALQUIER_ROL_KEY
          ? meta.cualquiera
          : undefined,
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  // Se silencia el error que el guard registra al detectar un endpoint mal
  // declarado: en estas pruebas es el resultado esperado, no un fallo.
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation());
  afterAll(() => jest.restoreAllMocks());

  it('deja pasar a un rol declarado', () => {
    const g = new RolesGuard(reflector({ roles: [Role.OWNER, Role.ADMIN] }));
    expect(g.canActivate(contexto({ role: Role.ADMIN }))).toBe(true);
  });

  it('rechaza a un rol no declarado', () => {
    const g = new RolesGuard(reflector({ roles: [Role.OWNER, Role.ADMIN] }));
    expect(() => g.canActivate(contexto({ role: Role.DRIVER }))).toThrow(
      ForbiddenException,
    );
  });

  // El corazón del cambio.
  describe('sin declarar nada', () => {
    it('DENIEGA en vez de dejar pasar', () => {
      const g = new RolesGuard(reflector({}));
      expect(() => g.canActivate(contexto({ role: Role.OWNER }))).toThrow(
        ForbiddenException,
      );
    });

    it('deniega incluso al OWNER: el fallo tiene que verse el primer día', () => {
      const g = new RolesGuard(reflector({ roles: [] }));
      expect(() => g.canActivate(contexto({ role: Role.OWNER }))).toThrow(
        ForbiddenException,
      );
    });

    it('lo registra como error, porque desde fuera parece un permiso denegado', () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const g = new RolesGuard(reflector({}));

      expect(() => g.canActivate(contexto({ role: Role.OWNER }))).toThrow();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('no declara @Roles ni @CualquierRol'),
      );
    });
  });

  describe('@CualquierRol', () => {
    it.each([Role.OWNER, Role.DRIVER, Role.MERCHANT, Role.CUSTOMER])(
      'deja pasar a %s',
      (role) => {
        const g = new RolesGuard(reflector({ cualquiera: true }));
        expect(g.canActivate(contexto({ role }))).toBe(true);
      },
    );

    // "Cualquier rol" son los del tenant, no el público: sigue haciendo falta
    // sesión.
    it('sigue exigiendo sesión', () => {
      const g = new RolesGuard(reflector({ cualquiera: true }));
      expect(() => g.canActivate(contexto(undefined))).toThrow(
        ForbiddenException,
      );
    });
  });

  it('rechaza cuando no hay usuario aunque el rol esté declarado', () => {
    const g = new RolesGuard(reflector({ roles: [Role.OWNER] }));
    expect(() => g.canActivate(contexto(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
