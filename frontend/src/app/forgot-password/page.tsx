"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useSlugTenant } from "@/lib/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthAside,
  AuthBrand,
  AuthHeading,
  AuthShell,
} from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const router = useRouter();
  // El slug sale del subdominio, no de un campo.
  const { slug } = useSlugTenant();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Sin slug —panel raíz— el backend busca el correo en todas las empresas
      // y manda un código por cada una, cada uno con el enlace a su panel. La
      // clave se omite en vez de mandarse vacía: el DTO la valida si viene.
      await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(slug ? { slug, email } : { email }),
      });
      // La API responde igual exista o no la cuenta, y esta pantalla hace lo
      // mismo: si aquí se distinguiera, se perdería en el frontend la
      // protección que el backend se molesta en dar.
      setEnviado(true);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo enviar el código",
      );
    } finally {
      setLoading(false);
    }
  }

  if (enviado) {
    return (
      <AuthShell
        aside={
          <AuthAside
            title="Revisa tu correo"
            description="Si esa cuenta existe, el código ya va en camino."
            bullets={[
              "El código caduca en 30 minutos",
              "Solo sirve una vez",
              "Pedir uno nuevo anula el anterior",
            ]}
          />
        }
      >
        <AuthBrand />
        <AuthHeading
          title="Código enviado"
          description={`Si hay una cuenta con ${email} en esa empresa, recibirás un código para restablecer tu contraseña.`}
        />
        <div className="grid gap-3">
          <Button
            className="auth-cta h-11 font-semibold hover:opacity-100"
            onClick={() =>
              router.push(`/reset-password?email=${encodeURIComponent(email)}`)
            }
          >
            Ya tengo el código
          </Button>
          <Button
            variant="ghost"
            className="h-11 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setEnviado(false)}
          >
            Usar otro correo
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside={
        <AuthAside
          title="Recupera el acceso"
          description="Te mandamos un código de un solo uso al correo de la cuenta."
          bullets={[
            "No hace falta contactar con soporte",
            "El código caduca en 30 minutos",
            "Al restablecer se cierran las sesiones abiertas",
          ]}
        />
      }
    >
      <AuthBrand />

      <AuthHeading
        title="¿Olvidaste tu contraseña?"
        description="Dinos tu correo y te enviamos un código para volver a entrar."
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

        <Button
          type="submit"
          disabled={loading}
          className="auth-cta mt-2 h-11 font-semibold hover:opacity-100"
        >
          {loading ? "Enviando…" : "Enviarme el código"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-white/60">
        ¿Ya la recordaste?{" "}
        <Link href="/login" className="font-medium text-white hover:underline">
          Iniciar sesión
        </Link>
      </p>
    </AuthShell>
  );
}
