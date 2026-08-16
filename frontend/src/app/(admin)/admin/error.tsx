"use client";

import { Fallo } from "@/components/fallo";

/** Límite de error del panel de plataforma. Conserva su menú, como el del panel. */
export default function ErrorDePlataforma({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <Fallo error={error} retry={retry} titulo="Esta pantalla se rompió" />;
}
