import { ClaimStatus } from '@prisma/client';

/**
 * A dónde puede ir un reclamo desde donde está.
 *
 * Vive aparte del servicio y como dato, igual que `shipment-status.ts`: una
 * máquina de estados escrita a base de `if` dentro de los métodos se contradice
 * sola en cuanto hay dos caminos al mismo sitio, y no hay dónde mirarla entera.
 *
 * Lo que **no** aparece aquí es tan deliberado como lo que aparece:
 *
 * - De `SETTLED` no sale nada. Se devolvió dinero; deshacerlo no es cambiar un
 *   estado, es un movimiento de caja nuevo con su propio motivo.
 * - De `REJECTED` tampoco. Un rechazo que se reabre a discreción es un rechazo
 *   que no significa nada; si el cliente aporta pruebas nuevas, lo honesto es
 *   un reclamo nuevo que enlace al anterior y deje ver que hubo dos vueltas.
 * - `APPROVED` no vuelve a `INVESTIGATING`: dar la razón y luego seguir
 *   investigando es lo que el cliente vive como que le tomaron el pelo.
 */
export const TRANSICIONES: Record<ClaimStatus, ClaimStatus[]> = {
  [ClaimStatus.OPEN]: [
    ClaimStatus.INVESTIGATING,
    ClaimStatus.APPROVED,
    ClaimStatus.REJECTED,
  ],
  [ClaimStatus.INVESTIGATING]: [ClaimStatus.APPROVED, ClaimStatus.REJECTED],
  [ClaimStatus.APPROVED]: [ClaimStatus.SETTLED],
  [ClaimStatus.REJECTED]: [],
  [ClaimStatus.SETTLED]: [],
};

export function puedePasar(desde: ClaimStatus, hasta: ClaimStatus): boolean {
  return TRANSICIONES[desde].includes(hasta);
}

/** Estados en los que el reclamo ya no admite trabajo. */
export const FINALES: ClaimStatus[] = [
  ClaimStatus.REJECTED,
  ClaimStatus.SETTLED,
];
