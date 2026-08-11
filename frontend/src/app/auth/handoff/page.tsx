"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setSession, ApiError, CurrentUser } from "@/lib/api";
import { useSlugTenant } from "@/lib/use-tenant";
import { INICIO_POR_ROL } from "@/lib/logistics";
import {
  AuthBrand,
  AuthHeading,
  AuthShell,
} from "@/components/auth-shell";

/**
 * Donde aterriza quien entró por el panel raíz.
 *
 * El panel raíz comprobó la contraseña, pero no puede dejar la sesión escrita
 * aquí: `panel.<dominio>` y `<empresa>.<dominio>` son orígenes distintos y no
 * comparten `localStorage`. Lo que llega en la URL es un vale de un solo uso
 * que dura un minuto; esta pantalla lo canjea por los tokens de verdad, ya en
 * el origen de la empresa, y sigue al panel.
 *
 * No hay nada que pulsar a propósito: el vale ya está gastado en cuanto se
 * canjea, así que una pantalla intermedia con un botón solo añadiría un paso y
 * un vale caducado a quien tarde en pulsarlo.
 */

function Contenido() {
  const router = useRouter();
  const params = useSearchParams();
  const { slug, resuelto } = useSlugTenant();
  const [fallo, setFallo] = useState<string | null>(null);

  // Que falte el código se sabe al renderizar, así que se decide aquí y no en
  // el efecto: pasar por un `setState` para algo que ya se puede leer de la URL
  // provoca un render de más y un parpadeo de «Entrando…» que no lleva a nada.
  const code = params.get("code");
  const error = code ? fallo : "Este enlace no trae el código de acceso.";

  // El canje NO puede repetirse: el vale es de un solo uso, así que un segundo
  // intento fallaría siempre. En desarrollo React monta los efectos dos veces
  // para destapar justo esta clase de fallo, y sin esta guarda el primer canje
  // gastaba el vale y el segundo pintaba «el acceso caducó» encima.
  const yaCanjeado = useRef(false);

  useEffect(() => {
    if (!resuelto || !code) return;
    if (yaCanjeado.current) return;
    yaCanjeado.current = true;

    void (async () => {
      try {
        const tokens = await api<{
          accessToken: string;
          refreshToken: string;
        }>("/auth/handoff", {
          method: "POST",
          body: JSON.stringify({ code }),
        });

        // Igual que en el login: los tokens se guardan primero para que la
        // consulta de `/users/me` vaya autenticada, y luego se completa la
        // sesión con los datos reales.
        setSession({
          ...tokens,
          slug: slug ?? "",
          email: "",
          userId: "",
          name: null,
          role: "OPERATOR",
        });
        const me = await api<CurrentUser>("/users/me");
        setSession({
          ...tokens,
          slug: slug ?? "",
          email: me.email,
          userId: me.id,
          name: me.name,
          role: me.role,
        });

        // `replace` y no `push`: el historial no debe conservar una URL con el
        // vale dentro, ni dejar que «atrás» vuelva a una pantalla de canje que
        // ya no puede canjear nada.
        router.replace(INICIO_POR_ROL[me.role]);
      } catch (err) {
        setFallo(
          err instanceof ApiError
            ? err.message
            : "No se pudo completar el acceso",
        );
      }
    })();
  }, [code, resuelto, router, slug]);

  return (
    // Sin panel lateral: esta pantalla dura un parpadeo y no hay nada que leer
    // en ella.
    <AuthShell aside={null}>
      <AuthBrand />
      {error ? (
        <>
          <AuthHeading
            title="No se pudo entrar"
            description={error}
          />
          <p className="mt-6 text-sm text-white/50">
            <Link
              href="/login"
              className="rounded font-medium text-[#56b3a5] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]"
            >
              Volver a iniciar sesión
            </Link>
          </p>
        </>
      ) : (
        <AuthHeading
          title="Entrando…"
          description={
            slug
              ? `Un momento, estamos abriendo el panel de ${slug}.`
              : "Un momento, estamos abriendo tu panel."
          }
        />
      )}
    </AuthShell>
  );
}

export default function HandoffPage() {
  return (
    <Suspense fallback={null}>
      <Contenido />
    </Suspense>
  );
}
