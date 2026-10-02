import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ContrasenaNueva,
  contrasenaCorrecta,
  hashearContrasena,
  incumplePolitica,
} from './contrasenas';

class Dto {
  @ContrasenaNueva()
  password: string;
}

const errores = (password: unknown) =>
  validateSync(plainToInstance(Dto, { password }));

describe('contraseñas', () => {
  describe('política de contraseña nueva', () => {
    it('acepta una con mayúscula, minúscula, número y símbolo', () => {
      expect(incumplePolitica('Sup3rSecret!')).toBeNull();
      expect(errores('Sup3rSecret!')).toHaveLength(0);
    });

    it.each([
      ['corta', 'Ab1!'],
      ['sin mayúscula', 'sup3rsecret!'],
      ['sin minúscula', 'SUP3RSECRET!'],
      ['sin número', 'SuperSecret!'],
      ['sin símbolo', 'Sup3rSecret'],
    ])('rechaza una %s', (_caso, password) => {
      expect(incumplePolitica(password)).not.toBeNull();
      expect(errores(password)).toHaveLength(1);
    });

    // bcrypt trunca en 72 BYTES: 40 «ñ» son 40 caracteres pero 80 bytes, y a
    // partir del byte 72 dos contraseñas distintas valdrían lo mismo.
    it('cuenta el tope en bytes, no en caracteres', () => {
      expect(incumplePolitica('Aa1!' + 'ñ'.repeat(40))).toBe(
        'La contraseña es demasiado larga',
      );
    });

    it('rechaza lo que no es texto', () => {
      expect(errores(12345678)).toHaveLength(1);
    });
  });

  describe('hash y comprobación', () => {
    it('el hash no lleva la contraseña y la comprueba', async () => {
      const hash = await hashearContrasena('Sup3rSecret!');
      expect(hash).not.toContain('Sup3rSecret!');
      await expect(contrasenaCorrecta('Sup3rSecret!', hash)).resolves.toBe(
        true,
      );
      await expect(contrasenaCorrecta('Sup3rSecret?', hash)).resolves.toBe(
        false,
      );
    });

    // Cuenta sin contraseña: invitado sin aceptar o cuenta traída de ZITADEL.
    it('sin hash responde que no, con cualquier contraseña', async () => {
      await expect(contrasenaCorrecta('', null)).resolves.toBe(false);
      await expect(contrasenaCorrecta('Sup3rSecret!', undefined)).resolves.toBe(
        false,
      );
    });
  });
});
