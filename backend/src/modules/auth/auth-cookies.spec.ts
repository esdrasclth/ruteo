import type { Request, Response } from 'express';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  borrarCookies,
  cookieDe,
  guardarCookies,
} from './auth-cookies';

describe('cookies de autenticación', () => {
  it('lee una cookie concreta sin confundir prefijos', () => {
    const req = {
      headers: {
        cookie: 'otra=1; ruteo_access=abc%2E123; ruteo_access_extra=no',
      },
    } as Request;

    expect(cookieDe(req, ACCESS_COOKIE)).toBe('abc.123');
    expect(cookieDe(req, 'ausente')).toBeNull();
  });

  it('escribe cookies HttpOnly, SameSite y seguras en producción', () => {
    const cookie = jest.fn();
    guardarCookies(
      { cookie } as unknown as Response,
      { accessToken: 'access', refreshToken: 'refresh' },
      true,
    );

    const llamadas = cookie.mock.calls as [
      string,
      string,
      Record<string, unknown>,
    ][];
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0]).toEqual([
      ACCESS_COOKIE,
      'access',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      }),
    ]);
    expect(llamadas[1]?.[0]).toBe(REFRESH_COOKIE);
  });

  it('limpia ambas cookies al cerrar sesión', () => {
    const clearCookie = jest.fn();
    borrarCookies({ clearCookie } as unknown as Response, false);

    const llamadas = clearCookie.mock.calls as [
      string,
      Record<string, unknown>,
    ][];
    expect(llamadas.map(([nombre]) => nombre)).toEqual([
      ACCESS_COOKIE,
      REFRESH_COOKIE,
    ]);
  });
});
