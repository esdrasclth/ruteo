"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, setSession, ApiError, CurrentUser } from "@/lib/api";
import { useSlugTenant } from "@/lib/use-tenant";
import { INICIO_POR_ROL } from "@/lib/logistics";
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // El slug sale del subdominio, no de un campo.
  const { slug, resuelto } = useSlugTenant();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setLoading(true);
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ slug, email, password }) },
      );
      // Persist tokens first so the /users/me request is authenticated.
      setSession({
        ...tokens,
        slug,
        email,
        userId: "",
        name: null,
        role: "OPERATOR",
      });
      const me = await api<CurrentUser>("/users/me");
      setSession({
        ...tokens,
        slug,
        email: me.email,
        userId: me.id,
        name: me.name,
        role: me.role,
      });
      // Cada rol entra por donde puede trabajar. Mandar a todos a
      // `/dashboard` dejaba a repartidores y comercios en un tablero que
      // les responde 403 en cada consulta.
      router.replace(INICIO_POR_ROL[me.role]);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo iniciar sesión",
      );
      setLoading(false);
    }
  }

  return (
    <AuthShell
      aside={
        <AuthAside
          title="Toda tu operación en una sola pantalla"
          description="Casilleros, envíos, rutas y cobros conectados entre sí."
          bullets={[
            "Rastreo de USA a Honduras con hitos y aduana",
            "Rutas con prueba de entrega y cobro contra entrega",
            "Tus clientes consultan su guía sin llamarte",
          ]}
        >
          <AuthAsideCta
            title="¿Solo vienes a rastrear?"
            description="Si eres cliente y quieres saber dónde va tu paquete, no necesitas cuenta: basta con el número de guía."
            href="/track"
            cta="Consultar una guía"
          />
        </AuthAside>
      }
    >
      <AuthBrand />

      {resuelto && !slug ? (
        <>
          <AuthHeading
            title="Entra por la dirección de tu empresa"
            description="Cada empresa tiene su propia dirección. Esta es la general, y desde aquí no se puede iniciar sesión."
          />
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            Si tu empresa es <span className="text-white">mi-empresa</span>,
            entra por{" "}
            <span className="text-white">
              mi-empresa.{process.env.NEXT_PUBLIC_PANEL_BASE_HOST}
            </span>
            . La dirección está en el correo de alta que recibiste.
          </p>
          <p className="mt-6 text-sm text-white/50">
            ¿Tu empresa aún no tiene cuenta?{" "}
            <Link
              href="/register"
              className="rounded font-medium text-[#56b3a5] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]"
            >
              Regístrala
            </Link>
          </p>
        </>
      ) : (
        <>
          <AuthHeading
            title="Hola de nuevo"
            description={
              slug
                ? `Entra a ${slug} para retomar donde lo dejaste.`
                : "Entra con tus credenciales para retomar donde lo dejaste."
            }
          />

          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-white/80">
                Correo
              </Label>
              <Input
                id="email"
                type="email"
                className="auth-field h-11"
                placeholder="tu@correo.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="password" className="text-white/80">
                  Contraseña
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-white/60 transition-colors hover:text-white"
                >
                  ¿La olvidaste?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                className="auth-field h-11"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !resuelto}
              className="auth-cta mt-2 h-11 w-full text-sm font-semibold hover:opacity-100"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-white/50">
            ¿Tu empresa aún no tiene cuenta?{" "}
            <Link
              href="/register"
              className="rounded font-medium text-[#56b3a5] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]"
            >
              Regístrala
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
