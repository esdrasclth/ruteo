import { BadRequestException } from '@nestjs/common';
import { CredentialTokenType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CredentialsService } from './credentials.service';

// Lo que se prueba aquí es la parte que Ruteo NO puede delegar: la custodia y
// validación del código. ZITADEL no vale para esto —con token de cuenta de
// servicio acepta cualquier `verificationCode`, comprobado el 2026-08-08—, así
// que si estas reglas se rompen, el restablecimiento queda abierto de par en par.

type Fila = {
  id: string;
  userId: string;
  type: CredentialTokenType;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  createdAt: Date;
};

function montar(opciones: { usuario?: unknown; filas?: Fila[] } = {}) {
  const filas: Fila[] = opciones.filas ?? [];
  const enviados: { recipient: string; title: string | null; body: string }[] =
    [];
  const notificacionesGuardadas: Record<string, unknown>[] = [];
  const contrasenasFijadas: { userId: string; nueva: string }[] = [];

  const tx = {
    user: {
      findUnique: jest.fn(async () => opciones.usuario ?? null),
      update: jest.fn(async () => ({})),
    },
    credentialToken: {
      deleteMany: jest.fn(async () => {
        filas.length = 0;
        return { count: 0 };
      }),
      create: jest.fn(async ({ data }: { data: Fila }) => {
        filas.push(data);
        return data;
      }),
      findFirst: jest.fn(async () => {
        const ahora = new Date();
        return (
          [...filas]
            .reverse()
            .find((f) => !f.usedAt && f.expiresAt > ahora) ?? null
        );
      }),
      update: jest.fn(async ({ data }: { data: { attempts?: unknown } }) => {
        if (data.attempts && filas[0]) filas[0].attempts += 1;
        return filas[0];
      }),
    },
    notification: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        notificacionesGuardadas.push(data);
        return data;
      }),
    },
  };

  const servicio = new CredentialsService(
    { withTenant: async (_t: string, fn: (t: typeof tx) => unknown) => fn(tx) } as never,
    { resolveIdBySlug: async () => 'tenant-1' } as never,
    {
      establecerContrasena: jest.fn(async (userId: string, nueva: string) => {
        contrasenasFijadas.push({ userId, nueva });
      }),
      marcarCorreoVerificado: jest.fn(async () => undefined),
    } as never,
    { get: () => undefined } as never,
    {
      name: 'prueba',
      send: jest.fn(async (m: (typeof enviados)[number]) => {
        enviados.push(m);
        return { ok: true };
      }),
    } as never,
  );

  return { servicio, filas, enviados, notificacionesGuardadas, contrasenasFijadas, tx };
}

const USUARIO = {
  id: 'user-1',
  externalId: 'zit-1',
  email: 'ana@x.hn',
  emailVerified: true,
};
const SIN_VERIFICAR = { ...USUARIO, emailVerified: false };

describe('CredentialsService', () => {
  describe('solicitarRestablecimiento', () => {
    it('no revela si la cuenta existe: no envía nada y tampoco falla', async () => {
      const { servicio, enviados } = montar({ usuario: null });

      await expect(
        servicio.solicitarRestablecimiento('empresa', 'nadie@x.hn'),
      ).resolves.toBeUndefined();
      expect(enviados).toHaveLength(0);
    });

    it('envía un código de 6 dígitos y NO lo guarda en claro', async () => {
      const { servicio, filas, enviados } = montar({ usuario: USUARIO });

      await servicio.solicitarRestablecimiento('empresa', 'ana@x.hn');

      const codigo = /\b(\d{6})\b/.exec(enviados[0].body)?.[1];
      expect(codigo).toBeDefined();
      expect(filas).toHaveLength(1);
      expect(filas[0].codeHash).not.toContain(codigo!);
      await expect(bcrypt.compare(codigo!, filas[0].codeHash)).resolves.toBe(
        true,
      );
    });

    it('el cuerpo con el código NO queda en la tabla de notificaciones', async () => {
      // Esa tabla la lee cualquier operador del panel desde /notifications.
      const { servicio, notificacionesGuardadas, enviados } = montar({
        usuario: USUARIO,
      });

      await servicio.solicitarRestablecimiento('empresa', 'ana@x.hn');

      const codigo = /\b(\d{6})\b/.exec(enviados[0].body)![1];
      expect(
        JSON.stringify(notificacionesGuardadas).includes(codigo),
      ).toBe(false);
    });

    it('con el correo SIN verificar no emite código, y avisa por correo', async () => {
      // Mandar un código de recuperación a una dirección que nadie ha probado
      // entrega la cuenta a quien tenga esa bandeja: es el agujero clásico de
      // "recuperación sobre correo no verificado".
      const { servicio, filas, enviados } = montar({ usuario: SIN_VERIFICAR });

      await servicio.solicitarRestablecimiento('empresa', 'ana@x.hn');

      expect(filas).toHaveLength(0);
      expect(enviados).toHaveLength(1);
      expect(/\d{6}/.test(enviados[0].body)).toBe(false);
      expect(enviados[0].title).toMatch(/todav/i);
    });

    it('pedir un código nuevo invalida el anterior', async () => {
      const { servicio, filas, tx } = montar({ usuario: USUARIO });

      await servicio.solicitarRestablecimiento('empresa', 'ana@x.hn');
      await servicio.solicitarRestablecimiento('empresa', 'ana@x.hn');

      expect(tx.credentialToken.deleteMany).toHaveBeenCalled();
      expect(filas).toHaveLength(1);
    });
  });

  describe('restablecer', () => {
    async function conCodigo(codigo: string, ajustes: Partial<Fila> = {}) {
      const fila: Fila = {
        id: 'tok-1',
        userId: 'user-1',
        type: CredentialTokenType.PASSWORD_RESET,
        codeHash: await bcrypt.hash(codigo, 10),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 0,
        createdAt: new Date(),
        ...ajustes,
      };
      return montar({ usuario: USUARIO, filas: [fila] });
    }

    it('con el código correcto fija la contraseña en ZITADEL', async () => {
      const { servicio, contrasenasFijadas } = await conCodigo('123456');

      await servicio.restablecer('empresa', 'ana@x.hn', '123456', 'Nueva-2026!');

      expect(contrasenasFijadas).toEqual([
        { userId: 'zit-1', nueva: 'Nueva-2026!' },
      ]);
    });

    it('corta las sesiones vivas al restablecer', async () => {
      // Si se restablece porque robaron la cuenta, dejar el refresh del intruso
      // en pie no arregla nada.
      const { servicio, tx } = await conCodigo('123456');

      await servicio.restablecer('empresa', 'ana@x.hn', '123456', 'Nueva-2026!');

      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { refreshTokenHash: null } }),
      );
    });

    it('rechaza un código equivocado y NO toca la contraseña', async () => {
      const { servicio, contrasenasFijadas } = await conCodigo('123456');

      await expect(
        servicio.restablecer('empresa', 'ana@x.hn', '999999', 'Intruso-2026!'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(contrasenasFijadas).toHaveLength(0);
    });

    it('rechaza un código caducado', async () => {
      const { servicio, contrasenasFijadas } = await conCodigo('123456', {
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        servicio.restablecer('empresa', 'ana@x.hn', '123456', 'Nueva-2026!'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(contrasenasFijadas).toHaveLength(0);
    });

    it('el código es de un solo uso', async () => {
      const { servicio, contrasenasFijadas } = await conCodigo('123456');

      await servicio.restablecer('empresa', 'ana@x.hn', '123456', 'Nueva-2026!');
      await expect(
        servicio.restablecer('empresa', 'ana@x.hn', '123456', 'Otra-2026!'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(contrasenasFijadas).toHaveLength(1);
    });

    it('quema el código tras 5 intentos fallidos', async () => {
      // Seis dígitos son un millón de combinaciones y el código vive 30 minutos:
      // sin tope, un script lo recorre.
      const { servicio, filas, contrasenasFijadas } = await conCodigo('123456');

      for (let i = 0; i < 5; i++) {
        await expect(
          servicio.restablecer('empresa', 'ana@x.hn', '999999', 'X-2026-abc!'),
        ).rejects.toBeInstanceOf(BadRequestException);
      }

      // Al sexto, ni siquiera el código BUENO vale ya.
      await expect(
        servicio.restablecer('empresa', 'ana@x.hn', '123456', 'X-2026-abc!'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(contrasenasFijadas).toHaveLength(0);
      expect(filas).toHaveLength(0);
    });

    it('restablecer con el correo sin verificar se rechaza aunque el código sea bueno', async () => {
      // Doble control: sin verificar no se emite código, pero si alguien apunta
      // directo al endpoint, aquí también se corta.
      const fila = {
        id: 'tok-1',
        userId: 'user-1',
        type: CredentialTokenType.PASSWORD_RESET,
        codeHash: await bcrypt.hash('123456', 10),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 0,
        createdAt: new Date(),
      };
      const { servicio, contrasenasFijadas } = montar({
        usuario: SIN_VERIFICAR,
        filas: [fila],
      });

      await expect(
        servicio.restablecer('empresa', 'ana@x.hn', '123456', 'Nueva-2026!'),
      ).rejects.toThrow('Código inválido o caducado');
      expect(contrasenasFijadas).toHaveLength(0);
    });

    it('sin cuenta, el error es el MISMO que con código malo', async () => {
      const { servicio } = montar({ usuario: null });

      await expect(
        servicio.restablecer('empresa', 'nadie@x.hn', '123456', 'Nueva-2026!'),
      ).rejects.toThrow('Código inválido o caducado');
    });
  });

  describe('verificarCorreo', () => {
    it('con el código correcto lo marca verificado en ZITADEL', async () => {
      const fila: Fila = {
        id: 't',
        userId: 'user-1',
        type: CredentialTokenType.EMAIL_VERIFICATION,
        codeHash: await bcrypt.hash('654321', 10),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 0,
        createdAt: new Date(),
      };
      const { servicio } = montar({ usuario: USUARIO, filas: [fila] });

      await expect(
        servicio.verificarCorreo('tenant-1', 'user-1', '654321'),
      ).resolves.toBeUndefined();
    });

    it('rechaza el código equivocado', async () => {
      const fila: Fila = {
        id: 't',
        userId: 'user-1',
        type: CredentialTokenType.EMAIL_VERIFICATION,
        codeHash: await bcrypt.hash('654321', 10),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 0,
        createdAt: new Date(),
      };
      const { servicio } = montar({ usuario: USUARIO, filas: [fila] });

      await expect(
        servicio.verificarCorreo('tenant-1', 'user-1', '000000'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
