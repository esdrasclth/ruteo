import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nombreDeUsuario, ZitadelService } from './zitadel.service';

// El cliente se prueba contra un `fetch` simulado: lo que se verifica es el
// contrato documentado de la Session API v2 y, sobre todo, que un fallo de
// infraestructura NO se confunda con unas credenciales malas. Esa distinción es
// la que evita que una caída de ZITADEL se lea como una oleada de contraseñas
// equivocadas, y que un 500 deje pasar a alguien.

type Respuesta = {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
};

function config(valores: Record<string, string> = {}): ConfigService {
  const base: Record<string, string> = {
    ZITADEL_ISSUER: 'https://auth.brandsofts.com',
    ZITADEL_SERVICE_TOKEN: 'token-de-servicio',
    ...valores,
  };
  return {
    get: (k: string) => base[k],
    getOrThrow: (k: string) => {
      if (base[k] === undefined) throw new Error(`falta ${k}`);
      return base[k];
    },
  } as unknown as ConfigService;
}

/** Encola respuestas para las llamadas sucesivas a `fetch`. */
function simularFetch(...respuestas: Respuesta[]) {
  const llamadas: { url: string; metodo?: string; cuerpo?: unknown }[] = [];
  let i = 0;

  const fn = jest.fn(
    async (url: string, init?: { method?: string; body?: string }) => {
      llamadas.push({
        url,
        metodo: init?.method,
        cuerpo: init?.body ? (JSON.parse(init.body) as unknown) : undefined,
      });
      const r = respuestas[Math.min(i++, respuestas.length - 1)];
      if (r instanceof Error) throw r;
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: async () => r.json ?? {},
        text: async () => r.text ?? '',
      };
    },
  );

  global.fetch = fn as unknown as typeof fetch;
  return llamadas;
}

const SESION_CREADA = {
  json: { sessionId: 'ses-1', sessionToken: 'tok-1' },
};

// El PATCH devuelve SOLO `details` y `sessionToken`: no trae los factores.
// Comprobado contra la instancia real el 2026-08-08. Dar por buena la
// verificación con esta respuesta fue el fallo que dejó el login roto.
const PATCH_OK = {
  json: { sessionToken: 'tok-2', details: { sequence: '5' } },
};

// Los factores solo aparecen al releer la sesión.
const GET_OK = {
  json: {
    session: {
      id: 'ses-1',
      factors: {
        user: { id: 'user-9', organizationId: 'org-7' },
        password: { verifiedAt: '2026-08-08T10:00:00Z' },
      },
    },
  },
};

// Contraseña incorrecta: ZITADEL responde 400, no 401.
const PASSWORD_MAL = {
  ok: false,
  status: 400,
  text: '{"code":3,"message":"Password is invalid","details":[{"@type":"type.googleapis.com/zitadel.v1.CredentialsCheckError","failedAttempts":1}]}',
};

describe('nombreDeUsuario', () => {
  // Comprobado contra la instancia real el 2026-08-08: dar de alta el mismo
  // `username` devuelve 409 incluso en OTRA organización, porque el ajuste
  // "User Login must be Domain" está desactivado y no se puede tocar (la
  // instancia está compartida con otros proyectos de Brandsofts). De ahí que el
  // ámbito del tenant vaya dentro del nombre.
  it('mete el slug del tenant en el nombre, para que dos tenants puedan usar el mismo correo', () => {
    expect(nombreDeUsuario('catracha', 'admin@correo.hn')).toBe(
      'catracha:admin@correo.hn',
    );
    expect(nombreDeUsuario('otra-empresa', 'admin@correo.hn')).toBe(
      'otra-empresa:admin@correo.hn',
    );
    expect(nombreDeUsuario('catracha', 'admin@correo.hn')).not.toBe(
      nombreDeUsuario('otra-empresa', 'admin@correo.hn'),
    );
  });

  it('normaliza el correo a minúsculas', () => {
    expect(nombreDeUsuario('catracha', 'Admin@Correo.HN')).toBe(
      'catracha:admin@correo.hn',
    );
  });
});

describe('ZitadelService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('verificarCredenciales', () => {
    it('devuelve el usuario y su organización cuando la contraseña es válida', async () => {
      const llamadas = simularFetch(SESION_CREADA, PATCH_OK, GET_OK, {
        status: 204,
      });

      const res = await new ZitadelService(config()).verificarCredenciales(
        'ana@catracha.hn',
        'secreta',
      );

      expect(res).toEqual({ zitadelUserId: 'user-9', organizationId: 'org-7' });

      // El orden del contrato: primero la sesión con el usuario, después la
      // contraseña por PATCH sobre esa sesión.
      expect(llamadas[0].metodo).toBe('POST');
      expect(llamadas[0].url).toBe('https://auth.brandsofts.com/v2/sessions');
      expect(llamadas[0].cuerpo).toEqual({
        checks: { user: { loginName: 'ana@catracha.hn' } },
      });

      expect(llamadas[1].metodo).toBe('PATCH');
      expect(llamadas[1].url).toBe(
        'https://auth.brandsofts.com/v2/sessions/ses-1',
      );
      expect(llamadas[1].cuerpo).toEqual({
        sessionToken: 'tok-1',
        checks: { password: { password: 'secreta' } },
      });

      // Tercera llamada: releer la sesión para obtener los factores.
      expect(llamadas[2].metodo).toBe('GET');
      expect(llamadas[2].url).toBe(
        'https://auth.brandsofts.com/v2/sessions/ses-1',
      );
    });

    it('cierra la sesión en ZITADEL tras verificar', async () => {
      const llamadas = simularFetch(SESION_CREADA, PATCH_OK, GET_OK, {
        status: 204,
      });

      await new ZitadelService(config()).verificarCredenciales('a@b.hn', 'x');

      expect(llamadas[3].metodo).toBe('DELETE');
      expect(llamadas[3].url).toBe(
        'https://auth.brandsofts.com/v2/sessions/ses-1',
      );
    });

    it('un 400 con CredentialsCheckError son credenciales malas, no un 503', async () => {
      // ZITADEL responde 400 a una contraseña incorrecta. Mapearlo a 503 hacía
      // que un login fallido normal se reportara como caída del proveedor.
      simularFetch(SESION_CREADA, PASSWORD_MAL);

      await expect(
        new ZitadelService(config()).verificarCredenciales('a@b.hn', 'mala'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('un 400 SIN esa marca sigue siendo error nuestro, no credenciales', async () => {
      // Petición mal formada. Esconderla como "credenciales inválidas" la
      // volvería imposible de depurar.
      simularFetch(SESION_CREADA, {
        ok: false,
        status: 400,
        text: '{"message":"invalid field"}',
      });

      await expect(
        new ZitadelService(config()).verificarCredenciales('a@b.hn', 'x'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('rechaza si la contraseña no cuadra', async () => {
      simularFetch(SESION_CREADA, { ok: false, status: 401 });

      await expect(
        new ZitadelService(config()).verificarCredenciales('a@b.hn', 'mala'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza igual si el usuario no existe, sin distinguirlo de la contraseña', async () => {
      simularFetch({ ok: false, status: 404 });

      const intento = new ZitadelService(config()).verificarCredenciales(
        'noexiste@b.hn',
        'x',
      );

      // Mismo tipo y mismo mensaje que el caso anterior: si fueran distintos,
      // probando correos se averigua cuáles están dados de alta.
      await expect(intento).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(intento).rejects.toThrow('Credenciales inválidas');
    });

    it('NO deja pasar si la respuesta es 200 pero el factor no quedó verificado', async () => {
      // Defensa contra un cambio de la API que devolviera 200 sin verificar:
      // sin esta comprobación entraría cualquiera.
      simularFetch(SESION_CREADA, PATCH_OK, {
        json: { session: { factors: { user: { id: 'user-9' } } } },
      });

      await expect(
        new ZitadelService(config()).verificarCredenciales('a@b.hn', 'x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('un 500 de ZITADEL es indisponibilidad, no credenciales inválidas', async () => {
      simularFetch({ ok: false, status: 500, text: 'boom' });

      await expect(
        new ZitadelService(config()).verificarCredenciales('a@b.hn', 'x'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('si la instancia no responde, es indisponibilidad', async () => {
      global.fetch = jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      });

      await expect(
        new ZitadelService(config()).verificarCredenciales('a@b.hn', 'x'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('sin cuenta de servicio configurada falla como despliegue, no como login', async () => {
      simularFetch(SESION_CREADA);

      await expect(
        new ZitadelService(
          config({ ZITADEL_SERVICE_TOKEN: '' }),
        ).verificarCredenciales('a@b.hn', 'x'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('normaliza la barra final del issuer', async () => {
      const llamadas = simularFetch(SESION_CREADA, PATCH_OK, GET_OK, {
        status: 204,
      });

      await new ZitadelService(
        config({ ZITADEL_ISSUER: 'https://auth.brandsofts.com/' }),
      ).verificarCredenciales('a@b.hn', 'x');

      expect(llamadas[0].url).toBe('https://auth.brandsofts.com/v2/sessions');
    });
  });

  describe('crearUsuario', () => {
    it('da de alta al usuario y devuelve su id', async () => {
      const llamadas = simularFetch({ json: { userId: 'user-nuevo' } });

      const id = await new ZitadelService(config()).crearUsuario({
        loginName: 'catracha:ana@catracha.hn',
        email: 'ana@catracha.hn',
        password: 'secreta',
        nombre: 'Ana',
        organizationId: 'org-7',
      });

      expect(id).toBe('user-nuevo');
      expect(llamadas[0].url).toBe(
        'https://auth.brandsofts.com/v2/users/human',
      );
      expect(llamadas[0].cuerpo).toMatchObject({
        username: 'catracha:ana@catracha.hn',
        email: { email: 'ana@catracha.hn', isVerified: false },
        password: { password: 'secreta', changeRequired: false },
        organization: { orgId: 'org-7' },
      });
    });

    it('falla si ZITADEL no devuelve id', async () => {
      simularFetch({ json: {} });

      await expect(
        new ZitadelService(config()).crearUsuario({
          loginName: 'x:a@b.hn',
          email: 'a@b.hn',
          password: 'x',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
