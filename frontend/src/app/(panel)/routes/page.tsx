"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { useApi } from "@/lib/use-api";
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
import {
  MobileList,
  MobileListCard,
  MobileListMeta,
} from "@/components/responsive-list";
import {
  opcionDesdeUrl,
  paginaDesdeUrl,
  useUrlFilters,
} from "@/lib/use-url-filters";

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
  const { searchParams, actualizar } = useUrlFilters();
  // Llega desde el listado de repartidores: "ver las rutas de este repartidor".
  const driverId = searchParams.get("driverId");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const status = opcionDesdeUrl(
    searchParams,
    "status",
    [ALL, ...Object.keys(ROUTE_STATUS_LABELS)],
    ALL,
  );
  const page = paginaDesdeUrl(searchParams);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ driverId: "", scheduledDate: todayISO() });

  // La consulta se arma en el render porque ES la clave de caché.
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (status !== ALL) params.set("status", status);
  if (driverId) params.set("driverId", driverId);

  const { datos } = useApi<Paginated<RouteSummary>>(
    `/routes?${params}`,
    { mensajeDeError: "Error cargando rutas", keepPreviousData: true },
  );
  const data = datos ?? null;

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
      toast.error("Selecciona un repartidor");
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
                <Label htmlFor="route-driver">Repartidor *</Label>
                <Select
                  value={form.driverId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, driverId: v }))
                  }
                >
                  <SelectTrigger id="route-driver" className="w-full">
                    <SelectValue placeholder="Selecciona un repartidor" />
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
                    No hay repartidores; crea uno primero en la sección Repartidores.
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

      <Select
        value={status}
        onValueChange={(v) =>
          actualizar({ status: v === ALL ? null : v, page: null }, "push")
        }
      >
        <SelectTrigger
          aria-label="Filtrar rutas por estado"
          className="w-full bg-card sm:w-52"
        >
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
        <CardContent className="p-0" aria-busy={!routes}>
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
            <>
              <MobileList label="Rutas">
                {routes.map((r) => (
                  <MobileListCard
                    key={r.id}
                    href={`/routes/${r.id}`}
                    label={`Abrir ruta ${r.code}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">
                          {r.code}
                        </p>
                        <p className="mt-0.5 truncate text-sm">
                          {r.driver?.name ?? "Sin repartidor"}
                        </p>
                      </div>
                      <Badge className={routeStatusBadgeClass(r.status)}>
                        {ROUTE_STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      <MobileListMeta label="Fecha">
                        {new Date(r.scheduledDate).toLocaleDateString("es-HN", {
                          timeZone: "UTC",
                        })}
                      </MobileListMeta>
                      <MobileListMeta label="Paradas">
                        {r._count?.stops ?? 0} paradas
                      </MobileListMeta>
                    </div>
                  </MobileListCard>
                ))}
              </MobileList>
              <div className="hidden md:block">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Repartidor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Paradas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/routes/${r.id}`}
                        className="font-mono font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {r.code}
                      </Link>
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
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => actualizar({ page: page - 1 }, "push")}
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
          onClick={() => actualizar({ page: page + 1 }, "push")}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
