"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthAside,
  AuthAsideCta,
  AuthBrand,
  AuthHeading,
  AuthShell,
} from "@/components/auth-shell";

export default function TrackSearchPage() {
  const router = useRouter();
  const [tracking, setTracking] = useState("");

  const limpio = tracking.trim().toUpperCase();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (limpio) router.push(`/track/${encodeURIComponent(limpio)}`);
  }

  return (
    <AuthShell
      aside={
        <AuthAside
          title="Lo que vas a ver"
          description="El rastreo público muestra el recorrido completo, sin necesidad de crear una cuenta."
          bullets={[
            "En qué punto está tu paquete y su fecha estimada",
            "El trayecto tramo por tramo, con mapa",
            "Cargos de aduana cuando el envío viene del extranjero",
          ]}
        >
          <AuthAsideCta
            title="¿No encuentras tu número?"
            description="Está en el correo de confirmación que te envió el comercio y en la etiqueta pegada al paquete. Empieza por RUT- y sigue con 10 caracteres."
            href="/login"
            cta="¿Eres del equipo? Inicia sesión"
          />
        </AuthAside>
      }
    >
      <AuthBrand />

      <AuthHeading
        title="¿Por dónde viene tu paquete?"
        description="Escribe el número de guía y te mostramos en qué punto del trayecto está ahora mismo."
      />

      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="tracking" className="text-white/80">
            Número de guía
          </Label>
          <Input
            id="tracking"
            // Se muestra en mayúsculas mientras se escribe, pero el valor se
            // normaliza igual al enviar: pegar la guía en minúsculas funciona.
            className="auth-field h-12 font-mono text-base uppercase tracking-wider placeholder:tracking-normal placeholder:normal-case"
            placeholder="RUT-XXXXXXXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            required
            autoFocus
          />
        </div>

        <Button
          type="submit"
          disabled={!limpio}
          // disabled al 55% y no menos: sobre el degradado y el fondo oscuro, una
          // opacidad más baja lo hacía parecer roto en vez de a la espera.
          className="auth-cta mt-1 h-12 w-full gap-2 text-sm font-semibold hover:opacity-100 disabled:opacity-55"
        >
          <Search className="size-4" />
          Rastrear envío
        </Button>
      </form>

      <p className="mt-6 text-sm text-white/50">
        La consulta es pública y no requiere cuenta. Solo mostramos el estado del
        envío, nunca datos personales del destinatario.
      </p>

      <p className="mt-3 text-sm text-white/50 lg:hidden">
        ¿Eres del equipo?{" "}
        <Link
          href="/login"
          className="rounded font-medium text-[#56b3a5] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]"
        >
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
