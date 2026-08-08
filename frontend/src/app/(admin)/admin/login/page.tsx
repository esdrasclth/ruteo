"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { platformApi, setPlatformSession } from "@/lib/platform-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthBrand, CreditoBrandsofts } from "@/components/auth-shell";

// Acceso al panel de plataforma.
//
// No reutiliza `AuthShell`: esa composición está pensada para vender (tarjeta
// clara con argumentos al lado) y aquí no hay nada que vender. Una pantalla
// sobria también avisa de dónde está entrando quien la ve.
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { accessToken } = await platformApi<{ accessToken: string }>(
        "/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      setPlatformSession({ accessToken, email });
      router.replace("/admin");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo iniciar sesión",
      );
      setLoading(false);
    }
  }

  return (
    <div className="brand-dark flex min-h-screen flex-1 items-center justify-center px-4 py-10">
      <div className="relative z-10 w-full max-w-sm">
        <div className="auth-panel rounded-3xl px-7 py-9">
          <AuthBrand />

          <div className="mt-6 flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2">
            <ShieldAlert className="size-4 shrink-0 text-amber-300" />
            <p className="text-xs leading-relaxed text-amber-100/80">
              Panel de plataforma. Esta cuenta ve y administra{" "}
              <span className="font-medium">todas las empresas</span>.
            </p>
          </div>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">
            Acceso de plataforma
          </h1>

          <form onSubmit={onSubmit} className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-white/80">
                Correo
              </Label>
              <Input
                id="email"
                type="email"
                className="auth-field h-11"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-white/80">
                Contraseña
              </Label>
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
              disabled={loading}
              className="auth-cta mt-2 h-11 font-semibold hover:opacity-100"
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-xs text-white/40">
            La sesión dura 30 minutos y no se renueva sola.
          </p>
        </div>

        <CreditoBrandsofts />
      </div>
    </div>
  );
}
