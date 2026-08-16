import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lo que se ve mientras se descarga el código de una pantalla del panel.
 *
 * Se dibuja DENTRO del armazón, así que el menú y la barra ya están puestos y
 * lo único que cambia es el área de contenido: la navegación no parpadea.
 *
 * En un panel de datos que se piden desde el navegador esto no cubre la espera
 * de la API —de eso se encargan los esqueletos de cada pantalla—, sino la del
 * bundle de la ruta. Se nota justo donde más importa: un teléfono con mala
 * cobertura, que es desde donde entra un repartidor.
 */
export default function CargandoPanel() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
