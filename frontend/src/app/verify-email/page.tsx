"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, MailWarning } from "lucide-react";
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

type Estado = "listo" | "enviando" | "hecho" | "error";

function Contenido() {
  const params = useSearchParams();
  // Los datos llegan en el enlace del correo. Se leen al inicializar el estado
  // y no en un efecto: con efecto habría un primer render con los campos vacíos
  // y un salto visible al rellenarse.
  // El slug ya no viaja en el enlace: sale del subdominio por el que se abre.
  const { slug, resuelto } = useSlugTenant();
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [code, setCode] = useState(() => params.get("code") ?? "");
  const [estado, setEstado] = useState<Estado>("listo");
  const [error, setError] = useState<string | null>(null);

  // A propósito NO se verifica solo al abrir. Los clientes de correo y los
  // antivirus visitan los enlaces por su cuenta para analizarlos: con
  // verificación automática, ese barrido gastaría el código —que es de un solo
  // uso— y el usuario llegaría a un enlace ya caducado. Por eso hace falta el
  // clic, que es lo que confirma que hay una persona.
  async function verificar() {
    setEstado("enviando");
    setError(null);
    try {
      await api("/auth/verify-email-link", {
        method: "POST",
        body: JSON.stringify({ slug, email, code }),
      });
      setEstado("hecho");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo verificar el correo",
      );
      setEstado("error");
    }
  }

  if (estado === "hecho") {
    return (
      <AuthShell
        aside={
          <AuthAside
            title="Cuenta completa"
            description="Ya no falta nada para operar con todas las funciones."
            bullets={[
              "Puedes recuperar la cuenta si olvidas la contraseña",
              "Puedes invitar a tu equipo",
              "Puedes crear llaves de API",
            ]}
          />
        }
      >
        <AuthBrand />
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-7 text-emerald-400" />
          <AuthHeading
            title="Correo verificado"
            description={`Confirmamos ${email}. Ya no falta nada en tu cuenta.`}
          />
        </div>
        <Button
          asChild
          className="auth-cta mt-2 h-11 font-semibold hover:opacity-100"
        >
          <Link href="/dashboard">Ir al panel</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside={
        <AuthAside
          title="Verifica tu correo"
          description="Es lo que nos permite devolverte la cuenta si olvidas la contraseña."
          bullets={[
            "Sin verificar no se puede recuperar la cuenta",
            "Ni invitar gente ni crear llaves de API",
            "Tu operación diaria no se ve afectada",
          ]}
        />
      }
    >
      <AuthBrand />

      <AuthHeading
        title="Confirma tu correo"
        description={
          code
            ? "Ya trajimos el código del enlace. Solo falta que lo confirmes."
            : "Escribe el código que te llegó por correo."
        }
      />

      <div className="grid gap-4">
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
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-white/60">
            Cuenta: <span className="text-white">{email}</span> ·{" "}
            <span className="text-white">{slug}</span>
          </p>
        )}

        <div className="grid gap-2.5">
          <p className="text-sm font-medium leading-none text-white/80">
            Código
          </p>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (error) setError(null);
            }}
            variant="oscuro"
            disabled={estado === "enviando"}
            autoFocus={!code}
          />
        </div>

        {error ? (
          <p className="flex items-start gap-2 text-sm text-amber-300">
            <MailWarning className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button
          onClick={verificar}
          disabled={estado === "enviando" || code.length < 6 || !slug || !email}
          className="auth-cta mt-2 h-11 font-semibold hover:opacity-100"
        >
          {estado === "enviando" ? "Verificando…" : "Verificar mi correo"}
        </Button>
      </div>

      <p className="mt-6 text-sm text-white/60">
        ¿El código ya no vale?{" "}
        <Link href="/login" className="font-medium text-white hover:underline">
          Entra al panel
        </Link>{" "}
        y pide uno nuevo desde el aviso.
      </p>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <Contenido />
    </Suspense>
  );
}
