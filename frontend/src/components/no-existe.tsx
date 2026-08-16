import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

/**
 * «Esto no existe», dentro del panel.
 *
 * Lo usan dos caminos distintos y a propósito comparten pieza:
 *
 * 1. `(panel)/not-found.tsx`, para cuando una ruta de servidor llama a
 *    `notFound()`.
 * 2. Las pantallas de detalle, cuando la API responde 404 al pedir el recurso.
 *    Ese segundo caso NO puede usar `notFound()`: los docs de esta versión lo
 *    dan por válido en componentes de servidor, funciones de servidor y route
 *    handlers, y estas pantallas son de cliente.
 *
 * Sin esto, pedir un envío que no existe dejaba un esqueleto para siempre —que
 * se lee como «sigue cargando» y es peor que un error— con un aviso rojo que se
 * desvanecía a los segundos.
 */
export function NoExiste({
  /** Qué se buscaba, en singular: «el envío», «el casillero». */
  recurso,
  volverA,
  etiquetaVolver,
}: {
  recurso: string;
  volverA: string;
  etiquetaVolver: string;
}) {
  return (
    <EmptyState
      icon={Compass}
      title={`No encontramos ${recurso}`}
      description="Puede que se haya eliminado, o que el enlace venga incompleto. Si llegaste desde un enlace compartido, pide que te lo manden otra vez."
      action={
        <Button asChild size="sm" variant="outline">
          <Link href={volverA}>{etiquetaVolver}</Link>
        </Button>
      }
    />
  );
}
