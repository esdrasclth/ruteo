"use client";

import { Fallo } from "@/components/fallo";

/**
 * Límite de error del panel.
 *
 * Vive DENTRO de `(panel)/layout.tsx`, así que un fallo de una pantalla deja el
 * menú y la barra en pie: se ve dónde estás y se puede navegar a otro sitio sin
 * recargar. Un límite en la raíz se habría llevado el armazón por delante.
 */
export default function ErrorDelPanel({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <Fallo error={error} retry={retry} />;
}
