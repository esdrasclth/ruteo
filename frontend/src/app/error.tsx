"use client";

import { Fallo } from "@/components/fallo";

/**
 * Límite de error de las pantallas públicas: entrada, alta, rastreo.
 *
 * El panel y la plataforma tienen el suyo, más adentro, para conservar su
 * armazón. Este recoge lo que quede fuera de los dos.
 */
export default function ErrorPublico({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center">
      <Fallo error={error} retry={retry} />
    </div>
  );
}
