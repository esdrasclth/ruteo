import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, EmpresasDeAcceso } from './auth.service';
import { nombreDeUsuario } from './zitadel/zitadel.service';

// El login desde el panel raíz: sin slug, la empresa se averigua por el correo.
//
// Lo que se prueba aquí es que quitar el slug del cuerpo NO quita ninguna
// comprobación. La contraseña se verifica contra CADA empresa candidata —en
// ZITADEL son usuarios distintos, `slug:correo`—, y lo que sale son vales de
// traspaso, nunca tokens: la sesión tiene que nacer en el origen de la empresa.

const PLANTILLA = 'https://{slug}.ruteo.brandsofts.com';

interface Cuenta {
  slug: string;
  nombre: string;
  /** Contraseña que vale EN ESA empresa. */
  contrasena: string;
  estado?: string;
}

function montar(cuentas: Cuenta[], opciones: { zitadelCaido?: boolean } = {}) {
  const fallosAnotados: string[] = [];
  const limpiezas: string[] = [];
  const valesEmitidos: { tenantId: string; userId: string }[] = [];

  const tenants = {
    candidatosPorCorreo: jest.fn(() =>
      Promise.resolve(
        cuentas.map((c, i) => ({
          tenantId: `tenant-${i}`,
          slug: c.slug,
          nombre: c.nombre,
          userId: `user-${i}`,
          userStatus: c.estado ?? 'ACTIVE',
        })),
      ),
    ),
  };

  const zitadel = {
    verificarCredenciales: jest.fn((loginName: string, contrasena: string) => {
      if (opciones.zitadelCaido) {
        return Promise.reject(
          new ServiceUnavailableException('El proveedor no responde'),
        );
      }
      const cuenta = cuentas.find(
        (c) => nombreDeUsuario(c.slug, 'jefe@correo.com') === loginName,
      );
      if (!cuenta || cuenta.contrasena !== contrasena) {
        return Promise.reject(
          new UnauthorizedException('Credenciales inválidas'),
        );
      }
      return Promise.resolve({ zitadelUserId: 'z1', organizationId: null });
    }),
  };

  const throttle = {
    comprobar: jest.fn(() => Promise.resolve()),
    registrarFallo: jest.fn((cubo: string) => {
      fallosAnotados.push(cubo);
      return Promise.resolve();
    }),
    limpiar: jest.fn((cubo: string) => {
      limpiezas.push(cubo);
      return Promise.resolve();
    }),
  };

  const handoff = {
    emitir: jest.fn((destino: { tenantId: string; userId: string }) => {
      valesEmitidos.push(destino);
      return Promise.resolve(`vale-${destino.tenantId}`);
    }),
  };

  const servicio = new AuthService(
    {} as never,
    tenants as never,
    {} as never,
    { get: () => PLANTILLA } as never,
    zitadel as never,
    {} as never,
    throttle as never,
    handoff as never,
  );

  return {
    servicio,
    zitadel,
    throttle,
    fallosAnotados,
    limpiezas,
    valesEmitidos,
  };
}

const CORREO = 'jefe@correo.com';

describe('login sin slug (panel raíz)', () => {
  it('devuelve la única empresa donde la contraseña vale, con su vale dentro', async () => {
    const { servicio, valesEmitidos } = montar([
      { slug: 'enviospress', nombre: 'Envios Press', contrasena: 'buena123' },
    ]);

    const res = (await servicio.login({
      email: CORREO,
      password: 'buena123',
    })) as EmpresasDeAcceso;

    expect(res.empresas).toEqual([
      {
        slug: 'enviospress',
        nombre: 'Envios Press',
        url: 'https://enviospress.ruteo.brandsofts.com/auth/handoff?code=vale-tenant-0',
      },
    ]);
    // Lo que NO devuelve es tan importante como lo que devuelve: aquí no hay
    // tokens, porque este origen no es donde va a vivir la sesión.
    expect(res).not.toHaveProperty('accessToken');
    expect(valesEmitidos).toEqual([{ tenantId: 'tenant-0', userId: 'user-0' }]);
  });

  it('con el correo en dos empresas devuelve las dos', async () => {
    const { servicio } = montar([
      { slug: 'enviospress', nombre: 'Envios Press', contrasena: 'buena123' },
      { slug: 'aviotech', nombre: 'Aviotech', contrasena: 'buena123' },
    ]);

    const res = (await servicio.login({
      email: CORREO,
      password: 'buena123',
    })) as EmpresasDeAcceso;

    expect(res.empresas.map((e) => e.slug)).toEqual([
      'enviospress',
      'aviotech',
    ]);
  });

  // El caso que justifica probar una por una: el mismo correo en dos empresas
  // son dos usuarios distintos en ZITADEL, y pueden tener contraseñas distintas.
  it('solo devuelve las empresas donde ESA contraseña vale', async () => {
    const { servicio } = montar([
      { slug: 'enviospress', nombre: 'Envios Press', contrasena: 'buena123' },
      { slug: 'aviotech', nombre: 'Aviotech', contrasena: 'otra456' },
    ]);

    const res = (await servicio.login({
      email: CORREO,
      password: 'buena123',
    })) as EmpresasDeAcceso;

    expect(res.empresas.map((e) => e.slug)).toEqual(['enviospress']);
  });

  it('con la contraseña mal en todas responde 401 y anota el fallo', async () => {
    const { servicio, fallosAnotados } = montar([
      { slug: 'enviospress', nombre: 'Envios Press', contrasena: 'buena123' },
      { slug: 'aviotech', nombre: 'Aviotech', contrasena: 'buena123' },
    ]);

    await expect(
      servicio.login({ email: CORREO, password: 'mala' }),
    ).rejects.toThrow(UnauthorizedException);

    // UN solo fallo aunque se probaran dos empresas. Si se anotara uno por
    // empresa, el bloqueo llegaría antes de tiempo para quien trabaja en
    // varias; si se anotara por empresa en cubos distintos, tardaría el doble.
    expect(fallosAnotados).toEqual(['*']);
  });

  it('un correo que no existe en ninguna empresa no se distingue de una contraseña mala', async () => {
    const { servicio } = montar([]);

    await expect(
      servicio.login({ email: 'nadie@correo.com', password: 'loquesea' }),
    ).rejects.toThrow('Invalid credentials');
  });

  // Si el proveedor está caído, decirle al usuario "credenciales inválidas" lo
  // manda a cambiar una contraseña que estaba bien.
  it('con ZITADEL caído se propaga la avería y no se cuenta como fallo', async () => {
    const { servicio, fallosAnotados } = montar(
      [{ slug: 'enviospress', nombre: 'Envios Press', contrasena: 'buena123' }],
      { zitadelCaido: true },
    );

    await expect(
      servicio.login({ email: CORREO, password: 'buena123' }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(fallosAnotados).toEqual([]);
  });

  it('la cuenta desactivada lo dice, en vez de fingir que la contraseña está mal', async () => {
    const { servicio } = montar([
      {
        slug: 'enviospress',
        nombre: 'Envios Press',
        contrasena: 'buena123',
        estado: 'DISABLED',
      },
    ]);

    await expect(
      servicio.login({ email: CORREO, password: 'buena123' }),
    ).rejects.toThrow('Account is disabled');
  });

  it('la entrada correcta borra el historial de fallos', async () => {
    const { servicio, limpiezas } = montar([
      { slug: 'enviospress', nombre: 'Envios Press', contrasena: 'buena123' },
    ]);

    await servicio.login({ email: CORREO, password: 'buena123' });
    expect(limpiezas).toEqual(['*']);
  });

  // Sin tope, un correo dado de alta en cincuenta empresas convertiría cada
  // intento de login en cincuenta peticiones de red a ZITADEL.
  it('no prueba más de cinco empresas por intento', async () => {
    const muchas = Array.from({ length: 9 }, (_, i) => ({
      slug: `empresa-${i}`,
      nombre: `Empresa ${i}`,
      contrasena: 'buena123',
    }));
    const { servicio, zitadel } = montar(muchas);

    const res = (await servicio.login({
      email: CORREO,
      password: 'buena123',
    })) as EmpresasDeAcceso;

    expect(zitadel.verificarCredenciales).toHaveBeenCalledTimes(5);
    expect(res.empresas).toHaveLength(5);
  });
});
