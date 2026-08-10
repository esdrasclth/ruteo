import { NotificationChannel, Prisma } from '@prisma/client';
import { comprobarDestinatario, digitosDe } from './destinatario-permitido';

// Este filtro es lo único que separa "mandar un aviso a un cliente" de "usar el
// dominio de Ruteo como relay de correo". Si se rompe, se rompe en silencio: el
// correo sale igual y solo se nota cuando el dominio ya está en listas negras.

interface TxFalso {
  user: { findFirst: jest.Mock };
  customer: { findFirst: jest.Mock };
  $queryRaw: jest.Mock;
}

function tx(overrides: Partial<TxFalso> = {}): TxFalso {
  return {
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    customer: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// El módulo solo usa estos tres métodos del cliente de Prisma.
const como = (t: TxFalso) => t as unknown as Prisma.TransactionClient;

describe('digitosDe', () => {
  it('se queda solo con los dígitos', () => {
    expect(digitosDe('+504 9999-8888')).toBe('50499998888');
  });
});

describe('comprobarDestinatario', () => {
  describe('EMAIL', () => {
    it('acepta un correo del equipo', async () => {
      const t = tx({
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      });
      const r = await comprobarDestinatario(
        como(t),
        NotificationChannel.EMAIL,
        'operador@empresa.com',
      );
      expect(r.permitido).toBe(true);
    });

    it('acepta un correo de la lista de clientes', async () => {
      const t = tx({
        customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
      });
      const r = await comprobarDestinatario(
        como(t),
        NotificationChannel.EMAIL,
        'cliente@ejemplo.com',
      );
      expect(r.permitido).toBe(true);
    });

    // El caso que motivó todo esto.
    it('rechaza un correo que no existe en la empresa', async () => {
      const r = await comprobarDestinatario(
        como(tx()),
        NotificationChannel.EMAIL,
        'victima@banco.com',
      );
      expect(r.permitido).toBe(false);
    });

    it('busca sin distinguir mayúsculas y sin espacios alrededor', async () => {
      const t = tx();
      await comprobarDestinatario(
        como(t),
        NotificationChannel.EMAIL,
        '  Cliente@Ejemplo.COM ',
      );
      for (const mock of [t.user.findFirst, t.customer.findFirst]) {
        expect(mock).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              email: { equals: 'cliente@ejemplo.com', mode: 'insensitive' },
            },
          }),
        );
      }
    });
  });

  describe('SMS y WhatsApp', () => {
    it('acepta un teléfono que aparece en los datos de la empresa', async () => {
      const t = tx({ $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]) });
      const r = await comprobarDestinatario(
        como(t),
        NotificationChannel.SMS,
        '+504 9999-8888',
      );
      expect(r.permitido).toBe(true);
    });

    it('rechaza un teléfono desconocido', async () => {
      const r = await comprobarDestinatario(
        como(tx()),
        NotificationChannel.WHATSAPP,
        '+1 555 010 9999',
      );
      expect(r.permitido).toBe(false);
    });

    // Sin este mínimo, un sufijo corto ("88") coincidiría con media base de
    // datos y el filtro dejaría de filtrar.
    it('rechaza un número demasiado corto sin llegar a consultar', async () => {
      const t = tx();
      const r = await comprobarDestinatario(
        como(t),
        NotificationChannel.SMS,
        '9999',
      );
      expect(r.permitido).toBe(false);
      expect(t.$queryRaw).not.toHaveBeenCalled();
    });
  });

  it('rechaza PUSH: no hay registro de dispositivos contra el que validar', async () => {
    const r = await comprobarDestinatario(
      como(tx()),
      NotificationChannel.PUSH,
      'token-de-dispositivo',
    );
    expect(r.permitido).toBe(false);
  });
});
