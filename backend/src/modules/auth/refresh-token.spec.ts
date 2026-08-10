import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

/**
 * Regresión de la rotación del refresh token.
 *
 * `AuthService` guardaba la huella con `bcrypt.hash(refreshToken, 12)`. bcrypt
 * trunca su entrada a 72 bytes, y los primeros 72 bytes de dos JWT del mismo
 * usuario son idénticos (cabecera + arranque del `sub`), así que el token
 * ANTIGUO validaba contra el hash del NUEVO: rotar no invalidaba nada y un
 * refresh robado servía sus 7 días completos.
 *
 * Estas pruebas fijan las dos mitades: que el problema era real (para que
 * nadie "simplifique" volviendo a bcrypt) y que el esquema actual lo resuelve.
 */

const SECRETO = 'secreto-de-prueba';
const PAYLOAD = {
  sub: '3f9a1c22-7b4e-4c1d-9a2f-8e6b5d4c3a21',
  tid: '11111111-2222-3333-4444-555555555555',
  role: 'OWNER',
};

// Copia exacta de la huella que usa `auth.service.ts`.
const huella = (token: string) =>
  createHash('sha256').update(token).digest('hex');

describe('huella del refresh token', () => {
  const jwt = new JwtService({});
  let tokenViejo: string;
  let tokenNuevo: string;

  beforeAll(async () => {
    tokenViejo = await jwt.signAsync(PAYLOAD, {
      secret: SECRETO,
      expiresIn: '7d',
    });
    // Un segundo de diferencia para que cambie el `iat` y sean tokens
    // distintos, igual que en una rotación real.
    await new Promise((r) => setTimeout(r, 1100));
    tokenNuevo = await jwt.signAsync(PAYLOAD, {
      secret: SECRETO,
      expiresIn: '7d',
    });
  });

  it('genera tokens realmente distintos al rotar', () => {
    expect(tokenNuevo).not.toEqual(tokenViejo);
  });

  // Documenta POR QUÉ no se puede usar bcrypt aquí. Si esta prueba empieza a
  // fallar es que bcrypt dejó de truncar, no que el código esté mal.
  it('los primeros 72 bytes son idénticos: por eso bcrypt no sirve', async () => {
    expect(tokenNuevo.slice(0, 72)).toEqual(tokenViejo.slice(0, 72));

    const hashBcryptDelNuevo = await bcrypt.hash(tokenNuevo, 4);
    await expect(bcrypt.compare(tokenViejo, hashBcryptDelNuevo)).resolves.toBe(
      true,
    );
  });

  it('con sha256, el token viejo NO valida contra la huella del nuevo', () => {
    expect(huella(tokenViejo)).not.toEqual(huella(tokenNuevo));
  });

  it('la huella es estable para el mismo token', () => {
    expect(huella(tokenViejo)).toEqual(huella(tokenViejo));
  });

  it('cubre el token entero y no solo su prefijo', () => {
    const a = `${'x'.repeat(200)}A`;
    const b = `${'x'.repeat(200)}B`;
    expect(huella(a)).not.toEqual(huella(b));
  });
});
