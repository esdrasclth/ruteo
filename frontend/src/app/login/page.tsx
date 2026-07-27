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

export default function LoginPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      router.replace("/dashboard");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo iniciar sesión",
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
            Inicia sesión en el panel de tu empresa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="slug">Empresa (slug)</Label>
              <Input
                id="slug"
                placeholder="mi-empresa"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@correo.com"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Tu empresa aún no tiene cuenta?{" "}
            <Link href="/register" className="text-primary underline">
              Regístrala
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
