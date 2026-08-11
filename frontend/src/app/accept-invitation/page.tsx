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
  const { slug, resuelto } = useSlugTenant();
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [code, setCode] = useState(() => params.get("code") ?? "");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmar) {
      // Se comprueba aquí porque un error de tecleo gastaría el código de la
      // invitación, que es de un solo uso.
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/accept-invitation", {
        method: "POST",
        body: JSON.stringify({ slug, email, code, password }),
      });
      toast.success("Cuenta lista. Ya puedes entrar.");
      router.replace("/login");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo aceptar la invitación",
      );
      setLoading(false);
    }
  }

  return (
    <AuthShell
      aside={
        <AuthAside
          title="Bienvenido al equipo"
          description="Elige tu contraseña. Nadie más la conoce, ni siquiera quien te invitó."
          bullets={[
            "Tu correo queda verificado al aceptar",
            "El enlace de la invitación solo sirve una vez",
            "Podrás cambiarla cuando quieras desde el panel",
          ]}
        />
      }
    >
      <AuthBrand />

      <AuthHeading
        title="Activa tu cuenta"
        description="Te dieron de alta en Ruteo. Elige la contraseña con la que vas a entrar."
      />

      <form onSubmit={onSubmit} className="grid gap-4">
        {resuelto && !slug ? (
          <p className="text-sm text-white/70">
            Abre este enlace desde la direccion de tu empresa.
          </p>
        ) : !email ? (
          <>
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
          </>
        ) : (
          <p className="text-sm text-white/60">
            Te unes a <span className="text-white">{slug}</span> como{" "}
            <span className="text-white">{email}</span>
          </p>
        )}

        <div className="grid gap-2.5">
          <Label className="text-white/80">Código de la invitación</Label>
          <OtpInput
            value={code}
            onChange={setCode}
            variant="oscuro"
            disabled={loading}
            autoFocus={!code}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password" className="text-white/80">
            Tu contraseña
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
            Repítela
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
          disabled={loading || code.length < 6}
          className="auth-cta mt-2 h-11 font-semibold hover:opacity-100"
        >
          {loading ? "Activando…" : "Activar mi cuenta"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-white/60">
        ¿Ya la activaste?{" "}
        <Link href="/login" className="font-medium text-white hover:underline">
          Iniciar sesión
        </Link>
      </p>
    </AuthShell>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}
