import { ShipmentStatus, ShipmentType } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { allowedNextStatuses, canTransition } from './shipment-status';

const S = ShipmentStatus;
const { LOCAL, INTERNATIONAL } = ShipmentType;

const TODOS_LOS_ESTADOS = Object.values(ShipmentStatus);
const TODOS_LOS_TIPOS = Object.values(ShipmentType);

// Estados que cierran el ciclo de vida: no admiten ninguna transición de salida.
const TERMINALES = [S.DELIVERED, S.RETURNED, S.CANCELLED];

describe('Máquina de estados de envíos', () => {
  describe('flujo feliz', () => {
    // Cada camino se recorre paso a paso; si una transición intermedia deja de
    // existir, falla el paso concreto y no todo el bloque.
    const caminos: {
      tipo: ShipmentType;
      nombre: string;
      pasos: ShipmentStatus[];
    }[] = [
      {
        tipo: LOCAL,
        nombre: 'última milla local',
        pasos: [
          S.CREATED,
          S.LABEL_GENERATED,
          S.PICKED_UP,
          S.IN_TRANSIT,
          S.OUT_FOR_DELIVERY,
          S.DELIVERED,
        ],
      },
      {
        tipo: INTERNATIONAL,
        nombre: 'internacional USA → Honduras',
        pasos: [
          S.CREATED,
          S.RECEIVED_USA,
          S.CONSOLIDATED,
          S.IN_TRANSIT_INTL,
          S.IN_CUSTOMS_HN,
          S.CUSTOMS_CLEARED,
          S.IN_WAREHOUSE_HN,
          S.OUT_FOR_DELIVERY,
          S.DELIVERED,
        ],
      },
    ];

    it.each(caminos)('$nombre avanza de principio a fin', ({ tipo, pasos }) => {
      for (let i = 0; i < pasos.length - 1; i++) {
        expect({
          de: pasos[i],
          a: pasos[i + 1],
          permitido: canTransition(tipo, pasos[i], pasos[i + 1]),
        }).toEqual({ de: pasos[i], a: pasos[i + 1], permitido: true });
      }
    });

    it('el desvío por retención en aduana vuelve al flujo principal', () => {
      expect(
        canTransition(INTERNATIONAL, S.IN_CUSTOMS_HN, S.ON_HOLD_CUSTOMS),
      ).toBe(true);
      expect(
        canTransition(INTERNATIONAL, S.ON_HOLD_CUSTOMS, S.CUSTOMS_CLEARED),
      ).toBe(true);
    });

    it('un intento fallido permite reintentar el reparto', () => {
      for (const tipo of TODOS_LOS_TIPOS) {
        expect(canTransition(tipo, S.OUT_FOR_DELIVERY, S.FAILED_ATTEMPT)).toBe(
          true,
        );
        expect(canTransition(tipo, S.FAILED_ATTEMPT, S.OUT_FOR_DELIVERY)).toBe(
          true,
        );
      }
    });
  });

  describe('los hitos no se cruzan entre tipos de envío', () => {
    // El riesgo real: marcar un envío local como "recibido en bodega USA", o uno
    // internacional como "etiqueta generada".
    const soloInternacional = [
      S.RECEIVED_USA,
      S.CONSOLIDATED,
      S.IN_TRANSIT_INTL,
      S.IN_CUSTOMS_HN,
      S.CUSTOMS_CLEARED,
      S.ON_HOLD_CUSTOMS,
      S.IN_WAREHOUSE_HN,
    ];
    const soloLocal = [S.LABEL_GENERATED, S.PICKED_UP, S.IN_TRANSIT];

    it.each(soloInternacional)('un envío LOCAL nunca llega a %s', (estado) => {
      const alcanzables = TODOS_LOS_ESTADOS.flatMap((desde) =>
        allowedNextStatuses(LOCAL, desde),
      );
      expect(alcanzables).not.toContain(estado);
    });

    it.each(soloLocal)('un envío INTERNATIONAL nunca llega a %s', (estado) => {
      const alcanzables = TODOS_LOS_ESTADOS.flatMap((desde) =>
        allowedNextStatuses(INTERNATIONAL, desde),
      );
      expect(alcanzables).not.toContain(estado);
    });
  });

  describe('transiciones prohibidas', () => {
    it('no se pueden saltar pasos', () => {
      expect(canTransition(LOCAL, S.CREATED, S.DELIVERED)).toBe(false);
      expect(canTransition(LOCAL, S.CREATED, S.OUT_FOR_DELIVERY)).toBe(false);
      expect(canTransition(INTERNATIONAL, S.CREATED, S.DELIVERED)).toBe(false);
      // Liberar de aduana sin haber pasado por aduana.
      expect(
        canTransition(INTERNATIONAL, S.CONSOLIDATED, S.CUSTOMS_CLEARED),
      ).toBe(false);
    });

    it('no se puede retroceder', () => {
      expect(canTransition(LOCAL, S.IN_TRANSIT, S.PICKED_UP)).toBe(false);
      expect(canTransition(LOCAL, S.OUT_FOR_DELIVERY, S.IN_TRANSIT)).toBe(
        false,
      );
      expect(
        canTransition(INTERNATIONAL, S.IN_CUSTOMS_HN, S.IN_TRANSIT_INTL),
      ).toBe(false);
      expect(
        canTransition(INTERNATIONAL, S.IN_WAREHOUSE_HN, S.CUSTOMS_CLEARED),
      ).toBe(false);
    });

    it('ningún estado transiciona a sí mismo', () => {
      // Los servicios comparan `status !== dto.status` antes de validar, así que
      // repetir el estado actual es un no-op, no una transición permitida.
      for (const tipo of TODOS_LOS_TIPOS) {
        for (const estado of TODOS_LOS_ESTADOS) {
          expect(canTransition(tipo, estado, estado)).toBe(false);
        }
      }
    });

    it.each(TERMINALES)('%s es terminal en ambos tipos', (terminal) => {
      for (const tipo of TODOS_LOS_TIPOS) {
        expect(allowedNextStatuses(tipo, terminal)).toEqual([]);
        for (const destino of TODOS_LOS_ESTADOS) {
          expect(canTransition(tipo, terminal, destino)).toBe(false);
        }
      }
    });
  });

  describe('reglas de cancelación', () => {
    // Regla de negocio: se cancela mientras el paquete no esté en movimiento.
    it('un envío local se cancela hasta que sale a reparto', () => {
      for (const estado of [
        S.CREATED,
        S.LABEL_GENERATED,
        S.PICKED_UP,
        S.FAILED_ATTEMPT,
      ]) {
        expect(canTransition(LOCAL, estado, S.CANCELLED)).toBe(true);
      }
      for (const estado of [S.IN_TRANSIT, S.OUT_FOR_DELIVERY]) {
        expect(canTransition(LOCAL, estado, S.CANCELLED)).toBe(false);
      }
    });

    it('un envío internacional ya no se cancela una vez en tránsito', () => {
      for (const estado of [S.CREATED, S.RECEIVED_USA, S.CONSOLIDATED]) {
        expect(canTransition(INTERNATIONAL, estado, S.CANCELLED)).toBe(true);
      }
      // A partir del despacho internacional solo cabe devolver, no cancelar:
      // el flete ya se incurrió y la mercancía está fuera del país.
      for (const estado of [
        S.IN_TRANSIT_INTL,
        S.IN_CUSTOMS_HN,
        S.ON_HOLD_CUSTOMS,
        S.CUSTOMS_CLEARED,
        S.IN_WAREHOUSE_HN,
        S.OUT_FOR_DELIVERY,
        S.FAILED_ATTEMPT,
      ]) {
        expect(canTransition(INTERNATIONAL, estado, S.CANCELLED)).toBe(false);
      }
    });
  });

  describe('forma del grafo', () => {
    function alcanzablesDesdeCreado(tipo: ShipmentType): Set<ShipmentStatus> {
      const vistos = new Set<ShipmentStatus>([S.CREATED]);
      const pendientes: ShipmentStatus[] = [S.CREATED];
      while (pendientes.length > 0) {
        for (const siguiente of allowedNextStatuses(tipo, pendientes.pop()!)) {
          if (!vistos.has(siguiente)) {
            vistos.add(siguiente);
            pendientes.push(siguiente);
          }
        }
      }
      return vistos;
    }

    it('un envío local recorre exactamente los 9 estados de su flujo', () => {
      expect([...alcanzablesDesdeCreado(LOCAL)].sort()).toEqual(
        [
          S.CANCELLED,
          S.CREATED,
          S.DELIVERED,
          S.FAILED_ATTEMPT,
          S.IN_TRANSIT,
          S.LABEL_GENERATED,
          S.OUT_FOR_DELIVERY,
          S.PICKED_UP,
          S.RETURNED,
        ].sort(),
      );
    });

    it('un envío internacional recorre exactamente los 13 estados de su flujo', () => {
      expect([...alcanzablesDesdeCreado(INTERNATIONAL)].sort()).toEqual(
        [
          S.CANCELLED,
          S.CONSOLIDATED,
          S.CREATED,
          S.CUSTOMS_CLEARED,
          S.DELIVERED,
          S.FAILED_ATTEMPT,
          S.IN_CUSTOMS_HN,
          S.IN_TRANSIT_INTL,
          S.IN_WAREHOUSE_HN,
          S.ON_HOLD_CUSTOMS,
          S.OUT_FOR_DELIVERY,
          S.RECEIVED_USA,
          S.RETURNED,
        ].sort(),
      );
    });

    it.each(TODOS_LOS_TIPOS)(
      'en %s ningún estado deja el envío atrapado',
      (tipo) => {
        // Desde cualquier estado alcanzable se debe poder llegar a un terminal;
        // si no, existiría un envío imposible de cerrar en el sistema.
        const atrapados = [...alcanzablesDesdeCreado(tipo)].filter((estado) => {
          const vistos = new Set<ShipmentStatus>([estado]);
          const pendientes = [estado];
          while (pendientes.length > 0) {
            const actual = pendientes.pop()!;
            if (TERMINALES.includes(actual)) {
              return false;
            }
            for (const siguiente of allowedNextStatuses(tipo, actual)) {
              if (!vistos.has(siguiente)) {
                vistos.add(siguiente);
                pendientes.push(siguiente);
              }
            }
          }
          return true;
        });

        expect(atrapados).toEqual([]);
      },
    );
  });

  describe('consistencia de la API del módulo', () => {
    it('canTransition y allowedNextStatuses nunca se contradicen', () => {
      for (const tipo of TODOS_LOS_TIPOS) {
        for (const desde of TODOS_LOS_ESTADOS) {
          const permitidos = allowedNextStatuses(tipo, desde);
          for (const hasta of TODOS_LOS_ESTADOS) {
            expect(canTransition(tipo, desde, hasta)).toBe(
              permitidos.includes(hasta),
            );
          }
        }
      }
    });

    it('allowedNextStatuses devuelve lista vacía para estados sin salida', () => {
      // Nunca `undefined`: el frontend itera el resultado directamente.
      for (const tipo of TODOS_LOS_TIPOS) {
        for (const estado of TODOS_LOS_ESTADOS) {
          expect(Array.isArray(allowedNextStatuses(tipo, estado))).toBe(true);
        }
      }
    });

    it('no hay destinos duplicados en ninguna lista', () => {
      for (const tipo of TODOS_LOS_TIPOS) {
        for (const estado of TODOS_LOS_ESTADOS) {
          const permitidos = allowedNextStatuses(tipo, estado);
          expect(permitidos).toEqual([...new Set(permitidos)]);
        }
      }
    });
  });

  // El panel web mantiene una copia de estas tablas para pintar el selector de
  // estados sin consultar la API. Si divergen, la UI ofrece transiciones que el
  // backend rechaza con 400 (o esconde otras que sí son válidas).
  describe('espejo del frontend', () => {
    const RUTA_ESPEJO = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'frontend',
      'src',
      'lib',
      'shipment-status.ts',
    );

    function leerTablaDelEspejo(
      fuente: string,
      nombre: string,
    ): Record<string, string[]> {
      const inicioDecl = fuente.indexOf(`const ${nombre}`);
      if (inicioDecl === -1) {
        throw new Error(`No se encontró ${nombre} en ${RUTA_ESPEJO}`);
      }
      const inicioObjeto = fuente.indexOf('{', inicioDecl);
      const finObjeto = fuente.indexOf('\n};', inicioObjeto);
      const cuerpo = fuente.slice(inicioObjeto, finObjeto);

      const tabla: Record<string, string[]> = {};
      for (const [, estado, destinos] of cuerpo.matchAll(
        /(\w+):\s*\[([^\]]*)\]/g,
      )) {
        tabla[estado] = [...destinos.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
      }
      return tabla;
    }

    const espejos: { tipo: ShipmentType; tabla: string }[] = [
      { tipo: LOCAL, tabla: 'LOCAL_TRANSITIONS' },
      { tipo: INTERNATIONAL, tabla: 'INTERNATIONAL_TRANSITIONS' },
    ];

    it.each(espejos)(
      '$tabla del panel coincide con el backend',
      ({ tipo, tabla }) => {
        const fuente = readFileSync(RUTA_ESPEJO, 'utf8');
        const delFrontend = leerTablaDelEspejo(fuente, tabla);

        // Se comparan tablas completas (no estado por estado) para detectar
        // también entradas sobrantes o faltantes en el espejo.
        const delBackend: Record<string, string[]> = {};
        for (const estado of TODOS_LOS_ESTADOS) {
          const permitidos = allowedNextStatuses(tipo, estado);
          if (permitidos.length > 0) {
            delBackend[estado] = [...permitidos];
          }
        }

        expect(delFrontend).toEqual(delBackend);
      },
    );

    it('el panel etiqueta en español todos los estados del enum', () => {
      const fuente = readFileSync(RUTA_ESPEJO, 'utf8');
      const inicio = fuente.indexOf('STATUS_LABELS');
      const etiquetados = [
        ...fuente
          .slice(inicio, fuente.indexOf('\n};', inicio))
          .matchAll(/(\w+):\s*"/g),
      ].map((m) => m[1]);

      expect([...etiquetados].sort()).toEqual([...TODOS_LOS_ESTADOS].sort());
    });
  });
});
