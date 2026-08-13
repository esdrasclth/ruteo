import { ChargeKind, ChargeStatus, Prisma } from '@prisma/client';
import { desglosar, motivosParaNoLiberar, saldoPendiente } from './saldo';

const d = (n: string | number) => new Prisma.Decimal(n);

const pendiente = (
  amount: string | number,
  kind: ChargeKind = ChargeKind.REVENUE,
) => ({ status: ChargeStatus.PENDING, kind, amount: d(amount) });
const pagado = (
  amount: string | number,
  kind: ChargeKind = ChargeKind.REVENUE,
) => ({ status: ChargeStatus.PAID, kind, amount: d(amount) });
const anulado = (
  amount: string | number,
  kind: ChargeKind = ChargeKind.REVENUE,
) => ({ status: ChargeStatus.VOID, kind, amount: d(amount) });

describe('saldoPendiente', () => {
  it('suma solo lo que sigue sin cobrarse', () => {
    expect(
      saldoPendiente([
        pendiente('17.25'),
        pagado('10'),
        pendiente('5'),
      ]).toString(),
    ).toBe('22.25');
  });

  // Si un cargo anulado siguiera contando, el envio quedaria bloqueado para
  // siempre por un saldo que ya nadie debe.
  it('un cargo anulado no se debe', () => {
    expect(saldoPendiente([anulado('50'), pendiente('5')]).toString()).toBe(
      '5',
    );
  });

  it('todo cobrado deja saldo cero, no nulo', () => {
    expect(saldoPendiente([pagado('30')]).toString()).toBe('0');
  });
});

describe('desglosar', () => {
  it('separa lo mio de lo del Estado, y lo cobrado de lo emitido', () => {
    const r = desglosar([
      pagado('10'), // manejo cobrado
      pagado('17.25', ChargeKind.PASS_THROUGH), // arancel cobrado
      pendiente('25'), // flete sin cobrar
      pendiente('19.84', ChargeKind.PASS_THROUGH), // ISV sin cobrar
    ]);

    expect(r.ingreso.toString()).toBe('35');
    expect(r.trasladado.toString()).toBe('37.09');
    expect(r.total.toString()).toBe('72.09');
    expect(r.cobrado.toString()).toBe('27.25');
    expect(r.pendiente.toString()).toBe('44.84');
  });

  // Contar los anulados inflaria los ingresos con cobros que nadie hizo.
  it('los anulados no entran en ningun recuento', () => {
    const r = desglosar([pagado('10'), anulado('999')]);
    expect(r.ingreso.toString()).toBe('10');
    expect(r.total.toString()).toBe('10');
  });

  it('lo emitido no es lo ingresado', () => {
    const r = desglosar([pendiente('100')]);
    expect(r.total.toString()).toBe('100');
    expect(r.cobrado.toString()).toBe('0');
  });
});

describe('motivosParaNoLiberar', () => {
  it('sin documentos que falten y sin saldo, se libera', () => {
    expect(
      motivosParaNoLiberar({
        faltanDocumentos: [],
        saldo: d(0),
        moneda: 'USD',
      }),
    ).toBeNull();
  });

  it('bloquea por saldo pendiente', () => {
    expect(
      motivosParaNoLiberar({
        faltanDocumentos: [],
        saldo: d('43.09'),
        moneda: 'USD',
      }),
    ).toBe('No se puede liberar: quedan 43.09 USD sin cobrar.');
  });

  // Los dos motivos juntos: decirlos por separado son dos viajes al mostrador
  // para el mismo tramite.
  it('dice los dos motivos a la vez', () => {
    expect(
      motivosParaNoLiberar({
        faltanDocumentos: ['factura comercial'],
        saldo: d('43.09'),
        moneda: 'USD',
      }),
    ).toBe(
      'No se puede liberar: falta factura comercial y quedan 43.09 USD sin cobrar.',
    );
  });
});
