"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, setSession, ApiError, CurrentUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify({ tenantName, slug, email, password }),
        },
      );
      // Persist tokens first so the /users/me request is authenticated.
      setSession({
        ...tokens,
        slug,
        email,
        userId: "",
        name: null,
        role: "OWNER",
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
      router.replace("/dashboard");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo registrar",
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl text-primary">Ruteo</CardTitle>
          <CardDescription>
            Registra tu empresa de mensajería
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tenantName">Nombre de la empresa</Label>
              <Input
                id="tenantName"
                placeholder="Encomiendas XYZ"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Identificador (slug)</Label>
              <Input
                id="slug"
                placeholder="encomiendas-xyz"
                pattern="[a-z0-9-]+"
                title="Minúsculas, números y guiones"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Correo del propietario</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Creando…" : "Crear cuenta"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-primary underline">
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
