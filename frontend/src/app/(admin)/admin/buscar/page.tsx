"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { Busqueda, platformApi } from "@/lib/platform-api";
import { Card, CardContent } from "@/components/ui/card";

function EmpresaRef({ t }: { t: { id: string; name: string; slug: string } }) {
  return (
    <Link
      href={`/admin/tenants/${t.id}`}
      className="font-medium text-primary hover:underline"
    >
      {t.name}
      <span className="ml-1.5 font-mono text-xs text-muted-foreground">
        {t.slug}
      </span>
    </Link>
  );
}

function Resultados() {
  const q = useSearchParams().get("q") ?? "";
  const [r, setR] = useState<Busqueda | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 3) return;
    setError(null);
    platformApi<Busqueda>(`/buscar?q=${encodeURIComponent(q)}`)
      .then(setR)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "No se pudo buscar"),
      );
  }, [q]);

  const vacio =
    r &&
    !r.empresas.length &&
    !r.envios.length &&
    !r.clientes.length &&
    !r.usuarios.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Resultados
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Búsqueda en todas las empresas de «{q}».
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {vacio ? (
        <p className="text-sm text-muted-foreground">
          Nada coincide con esa búsqueda.
        </p>
      ) : null}

      {r?.envios.length ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-primary">Envíos</p>
            <div className="mt-3 grid gap-2">
              {r.envios.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <span className="font-mono">{e.trackingNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.status}
                  </span>
                  <EmpresaRef t={e.tenant} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {r?.empresas.length ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-primary">Empresas</p>
            <div className="mt-3 grid gap-2">
              {r.empresas.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <EmpresaRef t={t} />
                  <span className="text-xs text-muted-foreground">
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {r?.clientes.length ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-primary">Clientes</p>
            <div className="mt-3 grid gap-2">
              {r.clientes.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <span>
                    {c.name}
                    {c.email ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.email}
                      </span>
                    ) : null}
                  </span>
                  <EmpresaRef t={c.tenant} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {r?.usuarios.length ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-primary">Usuarios</p>
            <div className="mt-3 grid gap-2">
              {r.usuarios.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <span>
                    {u.email}
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                      {u.role}
                    </span>
                  </span>
                  <EmpresaRef t={u.tenant} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default function BuscarPage() {
  return (
    <Suspense fallback={null}>
      <Resultados />
    </Suspense>
  );
}
