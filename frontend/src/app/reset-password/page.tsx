"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useSlugTenant } from "@/lib/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpInput } from "@/components/ui/otp-input";
import {
  AuthAside,
  AuthBrand,
  AuthHeading,
  AuthShell,
} from "@/components/auth-shell";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  // El slug ya no viaja en el enlace: sale del subdominio.
  const { slug } = useSlugTenant();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmar) {
      // Se comprueba aquí y no solo en el servidor porque equivocarse al
      // teclear la nueva contraseña gastaría el código, que es de un solo uso.
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (!slug) return;
    setLoading(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ slug, email, code, newPassword: password }),
      });
      toast.success("Contraseña cambiada. Ya puedes entrar.");
      router.replace("/login");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo restablecer la contraseña",
      );
      setLoading(false);
    }
  }

  return (
    <AuthShell
      aside={
        <AuthAside
          title="Elige una contraseña nueva"
          description="Al cambiarla se cierran todas las sesiones abiertas de esa cuenta."
          bullets={[
            "El código solo sirve una vez",
            "Caduca a los 30 minutos",
            "Tras varios intentos fallidos hay que pedir otro",
          ]}
        />
      }
    >
      <AuthBrand />

      <AuthHeading
        title="Restablecer contraseña"
        description="Escribe el código que te llegó por correo y tu contraseña nueva."
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2.5">
          <Label className="text-white/80">Código</Label>
          <OtpInput
            value={code}
            onChange={setCode}
            variant="oscuro"
            disabled={loading}
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password" className="text-white/80">
            Nueva contraseña
          </Label>
          <Input
            id="password"
            type="password"
            className="auth-field h-11"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmar" className="text-white/80">
            Repite la contraseña
          </Label>
          <Input
            id="confirmar"
            type="password"
            className="auth-field h-11"
            autoComplete="new-password"
            minLength={8}
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            required
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="auth-cta mt-2 h-11 font-semibold hover:opacity-100"
        >
          {loading ? "Guardando…" : "Cambiar contraseña"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-white/60">
        ¿No te llegó?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-white hover:underline"
        >
          Pedir otro código
        </Link>
      </p>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  // `useSearchParams` obliga a envolver en Suspense para que la página siga
  // siendo prerenderizable; sin esto el build falla.
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}
