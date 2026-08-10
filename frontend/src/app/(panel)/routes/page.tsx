"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Driver,
  Paginated,
  RouteStatus,
  RouteSummary,
} from "@/lib/api";
import {
  ROUTE_STATUS_LABELS,
  routeStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

const ALL = "ALL";
const PAGE_SIZE = 20;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// `useSearchParams` exige frontera Suspense para no romper el build estatico.
export default function RoutesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <RoutesContent />
    </Suspense>
  );
}

function RoutesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Llega desde el listado de repartidores: "ver las rutas de este repartidor".
  const driverId = searchParams.get("driverId");
  const [data, setData] = useState<Paginated<RouteSummary> | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [status, setStatus] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ driverId: "", scheduledDate: todayISO() });

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (status !== ALL) params.set("status", status);
    if (driverId) params.set("driverId", driverId);
    try {
      setData(await api<Paginated<RouteSummary>>(`/routes?${params}`));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando rutas",
      );
    }
  }, [page, status, driverId]);

  useEffect(() => {
    load();
  }, [load]);

  // Cambiar de filtro con la página 3 puesta deja una lista vacía sin explicar
  // por qué; se vuelve al principio.
  useEffect(() => {
    setPage(1);
  }, [status, driverId]);

  const routes = data?.items ?? null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  useEffect(() => {
    api<Driver[]>("/drivers")
      .then(setDrivers)
      .catch(() => setDrivers([]));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.driverId) {
      toast.error("Selecciona un driver");
      return;
    }
    setSaving(true);
    try {
      const route = await api<RouteSummary>("/routes", {
        method: "POST",
        body: JSON.stringify({
          driverId: form.driverId,
          scheduledDate: form.scheduledDate,
        }),
      });
      toast.success(`Ruta creada: ${route.code}`);
      setOpen(false);
      router.push(`/routes/${route.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear la ruta",
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={
          driverId
            ? [
                { label: "Repartidores", href: "/drivers" },
                { label: "Rutas asignadas" },
              ]
            : undefined
        }
        title="Rutas"
        description={
          data
            ? `${data.total} ruta${data.total === 1 ? "" : "s"}${
                driverId ? " de este repartidor" : ""
              }`
            : "Cargando…"
        }
        actions={
          driverId ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/routes">Ver todas</Link>
            </Button>
          ) : null
        }
      />
      <div className="flex items-center justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Nueva ruta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva ruta</DialogTitle>
            </DialogHeader>
            <form onSubmit={onCreate} className="grid gap-4">
              <div className="grid gap-2">
                <Label>Driver *</Label>
                <Select
                  value={form.driverId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, driverId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {drivers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No hay drivers; crea uno primero en la sección Drivers.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scheduledDate">Fecha *</Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  required
                  value={form.scheduledDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, scheduledDate: e.target.value }))
                  }
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creando…" : "Crear ruta"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-52 bg-card">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los estados</SelectItem>
          {(Object.keys(ROUTE_STATUS_LABELS) as RouteStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {ROUTE_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {!routes ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : routes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No hay rutas con ese filtro.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Paradas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/routes/${r.id}`)}
                  >
                    <TableCell className="font-mono">
                      {r.code}
                    </TableCell>
                    <TableCell>{r.driver?.name ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(r.scheduledDate).toLocaleDateString("es-HN", {
                        timeZone: "UTC",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge className={routeStatusBadgeClass(r.status)}>
                        {ROUTE_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r._count?.stops ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
