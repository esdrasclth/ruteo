"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { ApiError } from "@/lib/api";
import { platformApi, TenantResumen } from "@/lib/platform-api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  ACTIVE: { texto: "Activa", clase: "bg-emerald-500/12 text-emerald-700" },
  SUSPENDED: { texto: "Suspendida", clase: "bg-amber-500/15 text-amber-700" },
  CANCELLED: { texto: "Cancelada", clase: "bg-destructive/10 text-destructive" },
};

export default function AdminTenantsPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<TenantResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Se espera a que deje de teclear: sin esto sale una petición por letra.
    const t = setTimeout(() => {
      platformApi<TenantResumen[]>(`/tenants${q ? `?q=${encodeURIComponent(q)}` : ""}`)
        .then(setItems)
        .catch((e) =>
          setError(e instanceof ApiError ? e.message : "No se pudo cargar"),
        );
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Empresas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan, estado y uso de cada empresa del sistema.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o identificador…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="rounded-xl border border-border/70 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Usuarios</TableHead>
              <TableHead className="text-right">Envíos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No hay empresas que coincidan.
                </TableCell>
              </TableRow>
            ) : null}
            {items?.map((t) => {
              const e = ESTADO[t.status] ?? ESTADO.ACTIVE;
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {t.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">
                      {t.slug}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${e.clase}`}
                    >
                      {e.texto}
                    </span>
                    {t.statusReason ? (
                      <p className="mt-0.5 max-w-[18rem] truncate text-xs text-muted-foreground">
                        {t.statusReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.usuarios}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.envios}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
