import { Prisma } from '@prisma/client';
import {
  computeCharges,
  DEFAULT_DUTY_RATE,
  DEFAULT_TAX_RATE,
} from './customs-calc';

describe('Cálculo de cargos aduanales (Honduras)', () => {
  describe('fórmula', () => {
    it('aplica el caso de referencia: valor 250 con tasas por defecto y $10 de manejo', () => {
      const cargos = computeCharges({ declaredValue: 250, handlingFee: 10 });

      expect(cargos.dutyAmount.toString()).toBe('37.5'); // 250 × 15%
      expect(cargos.taxAmount.toString()).toBe('43.125'); // (250 + 37.5) × 15%
      expect(cargos.handlingFee.toString()).toBe('10');
      expect(cargos.totalCharges.toString()).toBe('90.625');
    });

    it('el ISV grava el valor MÁS el arancel, no solo el valor', () => {
      // Es la regla que más fácil se implementa mal. Con valor 100 y ambas tasas
      // al 15%: arancel 15, y el ISV se calcula sobre 115, no sobre 100.
      const cargos = computeCharges({ declaredValue: 100 });

      expect(cargos.dutyAmount.toString()).toBe('15');
      expect(cargos.taxAmount.toString()).toBe('17.25');
      expect(cargos.taxAmount.toString()).not.toBe('15');
    });

    it('el total es exactamente arancel + ISV + manejo', () => {
      const casos = [
        { declaredValue: 0, handlingFee: 0 },
        { declaredValue: 1, handlingFee: 10 },
        { declaredValue: 999.99, handlingFee: 25.5 },
        { declaredValue: 12345.67, dutyRate: 0.03, taxRate: 0.18 },
      ];

      for (const caso of casos) {
        const { dutyAmount, taxAmount, handlingFee, totalCharges } =
          computeCharges(caso);

        expect(totalCharges.toString()).toBe(
          dutyAmount.plus(taxAmount).plus(handlingFee).toString(),
        );
      }
    });

    it('las tasas por defecto son las de Honduras (15% y 15%)', () => {
      expect(DEFAULT_DUTY_RATE).toBe(0.15);
      expect(DEFAULT_TAX_RATE).toBe(0.15);

      const conDefaults = computeCharges({ declaredValue: 400 });
      const explicitas = computeCharges({
        declaredValue: 400,
        dutyRate: 0.15,
        taxRate: 0.15,
      });
      expect(conDefaults.totalCharges.toString()).toBe(
        explicitas.totalCharges.toString(),
      );
    });
  });

  describe('tasas personalizadas', () => {
    it('una tasa de 0 se respeta y NO cae al valor por defecto', () => {
      // El código usa `??`, no `||`. Con `||` un 0 explícito se convertiría en
      // 0.15 y se cobrarían impuestos sobre mercancía exenta.
      const sinArancel = computeCharges({ declaredValue: 200, dutyRate: 0 });
      expect(sinArancel.dutyAmount.toString()).toBe('0');
      expect(sinArancel.taxAmount.toString()).toBe('30'); // 200 × 15%

      const sinIsv = computeCharges({ declaredValue: 200, taxRate: 0 });
      expect(sinIsv.taxAmount.toString()).toBe('0');

      const exento = computeCharges({
        declaredValue: 200,
        dutyRate: 0,
        taxRate: 0,
        handlingFee: 10,
      });
      expect(exento.totalCharges.toString()).toBe('10'); // solo el manejo
    });

    it('acepta el tope de tasa permitido por el DTO (100%)', () => {
      // `UpsertCustomsDto` valida `@Min(0) @Max(1)`; el 1 debe funcionar.
      const cargos = computeCharges({
        declaredValue: 100,
        dutyRate: 1,
        taxRate: 1,
      });

      expect(cargos.dutyAmount.toString()).toBe('100');
      expect(cargos.taxAmount.toString()).toBe('200'); // (100 + 100) × 100%
      expect(cargos.totalCharges.toString()).toBe('300');
    });

    it('aplica tasas fraccionarias sin arrastrar error', () => {
      const cargos = computeCharges({
        declaredValue: 1234.56,
        dutyRate: 0.15,
        taxRate: 0,
      });

      // Con aritmética de punto flotante esto daría 185.18400000000003.
      expect(cargos.dutyAmount.toString()).toBe('185.184');
    });
  });

  describe('entradas ausentes', () => {
    it('sin valor declarado no hay arancel ni ISV', () => {
      for (const declaredValue of [undefined, null]) {
        const cargos = computeCharges({ declaredValue });

        expect(cargos.dutyAmount.toString()).toBe('0');
        expect(cargos.taxAmount.toString()).toBe('0');
        expect(cargos.totalCharges.toString()).toBe('0');
      }
    });

    it('sin cuota de manejo el cargo es 0, no undefined', () => {
      // El campo se persiste en una columna NOT NULL-friendly; nunca debe salir
      // `undefined` de aquí.
      for (const handlingFee of [undefined, null]) {
        const cargos = computeCharges({ declaredValue: 100, handlingFee });

        expect(cargos.handlingFee.toString()).toBe('0');
        expect(cargos.totalCharges.toString()).toBe('32.25'); // 15 + 17.25
      }
    });

    it('un envío sin ningún dato produce cargos en cero', () => {
      const cargos = computeCharges({});

      expect(cargos.totalCharges.toString()).toBe('0');
    });

    it('la cuota de manejo se cobra aunque el valor declarado sea 0', () => {
      const cargos = computeCharges({ declaredValue: 0, handlingFee: 15 });

      expect(cargos.totalCharges.toString()).toBe('15');
    });
  });

  describe('tipos de entrada', () => {
    // `CustomsService` pasa `shipment.declaredValue`, que Prisma entrega como
    // Decimal; el panel manda un number y un CSV podría traer string.
    it('number, string y Decimal dan el mismo resultado', () => {
      const comoNumero = computeCharges({
        declaredValue: 250,
        handlingFee: 10,
      });
      const comoTexto = computeCharges({
        declaredValue: '250',
        handlingFee: '10',
      });
      const comoDecimal = computeCharges({
        declaredValue: new Prisma.Decimal('250.00'),
        handlingFee: new Prisma.Decimal(10),
      });

      expect(comoTexto.totalCharges.toString()).toBe(
        comoNumero.totalCharges.toString(),
      );
      expect(comoDecimal.totalCharges.toString()).toBe(
        comoNumero.totalCharges.toString(),
      );
    });

    it('devuelve Decimals de Prisma, listos para persistir', () => {
      const cargos = computeCharges({ declaredValue: 250, handlingFee: 10 });

      for (const monto of Object.values(cargos)) {
        expect(monto).toBeInstanceOf(Prisma.Decimal);
      }
    });
  });

  describe('precisión y persistencia', () => {
    it('no redondea: el redondeo a 2 decimales lo hace la columna Decimal(12,2)', () => {
      // 90.625 se guarda como 90.63. Conviene tenerlo presente al comparar el
      // resultado del cálculo con lo que devuelve la API tras el upsert.
      const cargos = computeCharges({ declaredValue: 250, handlingFee: 10 });

      expect(cargos.totalCharges.toString()).toBe('90.625');
      expect(cargos.totalCharges.toDecimalPlaces(2).toString()).toBe('90.63');
    });

    it('mantiene la precisión con valores altos', () => {
      const cargos = computeCharges({
        declaredValue: '999999.99',
        dutyRate: 0.15,
        taxRate: 0.15,
      });

      expect(cargos.dutyAmount.toString()).toBe('149999.9985');
      expect(cargos.taxAmount.toString()).toBe('172499.998275');
    });

    it('los importes de un envío pequeño no colapsan a cero', () => {
      const cargos = computeCharges({ declaredValue: 0.01 });

      expect(cargos.dutyAmount.toString()).toBe('0.0015');
      expect(cargos.totalCharges.isZero()).toBe(false);
    });

    it('no muta la entrada recibida', () => {
      const entrada = {
        declaredValue: new Prisma.Decimal(250),
        handlingFee: new Prisma.Decimal(10),
      };
      computeCharges(entrada);

      expect(entrada.declaredValue.toString()).toBe('250');
      expect(entrada.handlingFee.toString()).toBe('10');
    });
  });
});
