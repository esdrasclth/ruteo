import { NoExiste } from "@/components/no-existe";

/**
 * 404 dentro del panel, con el armazón puesto.
 *
 * El de la raíz también funcionaría, pero se llevaría el menú por delante y
 * dejaría a quien se equivocó de URL sin forma de seguir sin recargar.
 *
 * Comparte pieza con las pantallas de detalle que reciben un 404 de la API
 * (ver `NoExiste`), para que «esto no existe» se vea igual venga de donde venga.
 */
export default function NoEncontradoEnPanel() {
  return (
    <NoExiste
      recurso="esta pantalla"
      volverA="/dashboard"
      etiquetaVolver="Volver al inicio"
    />
  );
}
