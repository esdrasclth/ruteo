"use client";

import { useEffect, useState } from "react";
import { slugActual } from "./tenant";

/**
 * El slug de la empresa según el subdominio de la pestaña.
 *
 * `resuelto` distingue "todavía no lo sé" de "no hay". Hace falta porque el
 * subdominio solo existe en el navegador y estas pantallas también se
 * renderizan en el servidor: si se leyera en el `useState` inicial daría
 * `null` allí y `"enviospress"` aquí, y React avisaría de que el HTML servido
 * no coincide con el que produce el cliente. Sin la bandera habría que elegir
 * entre parpadear el mensaje de "entra por tu dirección" durante un instante o
 * no mostrarlo nunca.
 */
export function useSlugTenant(): { slug: string | null; resuelto: boolean } {
  const [slug, setSlug] = useState<string | null>(null);
  const [resuelto, setResuelto] = useState(false);

  useEffect(() => {
    setSlug(slugActual());
    setResuelto(true);
  }, []);

  return { slug, resuelto };
}
