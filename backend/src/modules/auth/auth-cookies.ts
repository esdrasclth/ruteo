import type { Request, Response } from 'express';

export const ACCESS_COOKIE = 'ruteo_access';
export const REFRESH_COOKIE = 'ruteo_refresh';

/** Lee cookies sin depender de cookie-parser (y evita aceptar valores ambiguos). */
export function cookieDe(req: Request, nombre: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador < 0) continue;
    const clave = parte.slice(0, separador).trim();
    if (clave !== nombre) continue;
    try {
      return decodeURIComponent(parte.slice(separador + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function opcionesCookie(produccion: boolean, maxAge: number, domain?: string) {
  return {
    httpOnly: true,
    secure: produccion,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export function guardarCookies(
  response: Response,
  tokens: { accessToken: string; refreshToken: string },
  produccion: boolean,
  domain?: string,
) {
  response.cookie(
    ACCESS_COOKIE,
    tokens.accessToken,
    opcionesCookie(produccion, 15 * 60 * 1000, domain),
  );
  response.cookie(
    REFRESH_COOKIE,
    tokens.refreshToken,
    opcionesCookie(produccion, 7 * 24 * 60 * 60 * 1000, domain),
  );
}

export function borrarCookies(
  response: Response,
  produccion: boolean,
  domain?: string,
) {
  const opciones = opcionesCookie(produccion, 0, domain);
  response.clearCookie(ACCESS_COOKIE, opciones);
  response.clearCookie(REFRESH_COOKIE, opciones);
}
