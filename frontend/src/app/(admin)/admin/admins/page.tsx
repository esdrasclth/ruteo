"use client";

import { useState } from "react";
import { ShieldAlert, Terminal } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  getPlatformSession,
  PlatformAdmin,
  platformApi,
} from "@/lib/platform-api";
import { usePlatformApi } from "@/lib/use-platform-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminsPage() {
  const [guardando, setGuardando] = useState(false);

  const {
    datos,
    error: fallo,
    recargar,
  } = usePlatformApi<PlatformAdmin[]>("/admins", { silencioso: true });

  const items = datos ?? null;
  const error = fallo
    ? fallo instanceof ApiError
      ? fallo.message
      : "No se pudo cargar"
    : null;

  // La sesión de plataforma vive en el navegador y no cambia mientras dure la
  // pantalla; leerla en el render evita el `setState` en efecto que había.
  const yo = getPlatformSession()?.email ?? null;

  async function cambiar(a: PlatformAdmin) {
    setGuardando(true);
    const nuevo = a.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      // El PATCH devuelve la lista entera: se escribe en la caché sin volver a
      // pedirla.
      const lista = await platformApi<PlatformAdmin[]>(
        `/admins/${a.id}/status`,
        { method: "PATCH", body: JSON.stringify({ status: nuevo }) },
      );
      await recargar(lista, { revalidate: false });
      toast.success(
        nuevo === "ACTIVE" ? "Cuenta reactivada" : "Cuenta desactivada",
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Superadmins
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quién puede entrar a este panel y administrar todas las empresas.
        </p>
      </div>

      {/* El alta va por script a propósito; decirlo aquí evita que alguien
          busque un botón que no existe y acabe creando una vía alternativa. */}
      <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/40 px-4 py-3">
        <Terminal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            Las altas se hacen desde el servidor, no desde aquí.
          </p>
          <p className="mt-0.5">
            Un endpoint que crea cuentas con acceso a todas las empresas sería un
            objetivo permanente aunque estuviera protegido. Para dar de alta a
            alguien:
          </p>
          <code className="mt-1.5 block rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground">
            npx ts-node scripts/crear-superadmin.ts correo@dominio contraseña
            &quot;Nombre&quot;
          </code>
        </div>
      </div>

      <div className="grid gap-2">
        {items?.map((a) => {
          const esYo = a.email === yo;
          return (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {a.name || a.email}
                    {esYo ? (
                      <span className="rounded bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                        Tú
                      </span>
                    ) : null}
                    {a.status !== "ACTIVE" ? (
                      <span className="flex items-center gap-1 text-xs font-normal text-destructive">
                        <ShieldAlert className="size-3" />
                        Desactivado
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.lastLoginAt
                      ? `Último acceso: ${new Date(a.lastLoginAt).toLocaleString("es-HN")}`
                      : "Nunca ha entrado"}
                  </p>
                </div>
                <Button
                  variant={a.status === "ACTIVE" ? "outline" : "default"}
                  size="sm"
                  // Desactivarse a uno mismo dejaría el panel sin nadie dentro
                  // si es el último; el backend también lo impide.
                  disabled={guardando || esYo}
                  onClick={() => cambiar(a)}
                >
                  {a.status === "ACTIVE" ? "Desactivar" : "Reactivar"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
