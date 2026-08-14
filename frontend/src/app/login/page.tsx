"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  api,
  setSession,
  ApiError,
  CurrentUser,
  EmpresaDeAcceso,
} from "@/lib/api";
import { useSlugTenant } from "@/lib/use-tenant";
import { INICIO_POR_ROL } from "@/lib/logistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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

  // El slug sale del subdominio, no de un campo. En el panel raíz no hay, y ahí
  // la empresa se averigua por el correo.
  const { slug, resuelto } = useSlugTenant();

  // Solo se llena cuando el mismo correo y contraseña valen en más de una
  // empresa. Con una sola no se muestra nada: se redirige directo.
  const [empresas, setEmpresas] = useState<EmpresaDeAcceso[] | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

    // Sin slug —panel raíz— el backend responde con las empresas donde esta
    // credencial vale, cada una con su vale de traspaso. Los tokens no vienen
    // aquí: la sesión tiene que nacer en el subdominio de la empresa, que es un
    // origen distinto y no comparte `localStorage` con esta pantalla.
    if (!slug) {
      try {
        const { empresas: encontradas } = await api<{
          empresas: EmpresaDeAcceso[];
        }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });

        if (encontradas.length === 1) {
          // `location.href` y no el router de Next: es otro origen, no una ruta
          // de esta aplicación.
          window.location.href = encontradas[0].url;
          return;
        }
        setEmpresas(encontradas);
        setLoading(false);
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "No se pudo iniciar sesión",
        );
        setLoading(false);
      }
      return;
    }

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

      {empresas ? (
        <>
          {/* Solo se llega aquí con la contraseña ya comprobada: esta lista no
              revela en qué empresas está un correo a quien no la sabía. */}
          <AuthHeading
            title="¿A qué empresa entras?"
            description="Tu correo está dado de alta en más de una."
          />
          <ul className="mt-6 grid gap-2">
            {empresas.map((empresa) => (
              <li key={empresa.slug}>
                {/* Enlace normal y no el router de Next: cada empresa vive en
                    otro origen. Y `replace` en el historial no aplica aquí,
                    porque el vale de la URL se gasta al canjearse. */}
                <a
                  href={empresa.url}
                  className="flex items-baseline justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white transition-colors hover:border-[#56b3a5] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]"
                >
                  <span className="font-medium">{empresa.nombre}</span>
                  <span className="text-xs text-white/50">{empresa.slug}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-white/50">
            Los accesos de esta lista caducan en un minuto. Si se te pasa,
            vuelve a{" "}
            <button
              type="button"
              onClick={() => setEmpresas(null)}
              className="rounded font-medium text-[#56b3a5] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]"
            >
              iniciar sesión
            </button>
            .
          </p>
        </>
      ) : (
        <>
          <AuthHeading
            title="Hola de nuevo"
            description={
              slug
                ? `Entra a ${slug} para retomar donde lo dejaste.`
                : "Entra con tu correo y te llevamos al panel de tu empresa."
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
              <PasswordInput
                id="password"
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
