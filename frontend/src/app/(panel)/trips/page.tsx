"use client";

import { FormEvent, useState } from "react";
import { Plane, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Carrier,
  Paginated,
  Trip,
  TripStatus,
  Warehouse,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Paginacion } from "@/components/paginacion";
import { TRIP_STATUS_LABELS } from "@/lib/fase2";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Viajes: el vuelo físico que mueve la carga.
 *
 * Es el nivel por encima del manifiesto. Un mismo vuelo puede llevar varios
 * manifiestos, y un manifiesto se arma ANTES de saber en qué vuelo sale —por eso
 * el vuelo se engancha después y no al crearlo—.
 *
 * Lo que responde esta pantalla es «¿qué llega hoy?», que es con lo que la
 * bodega de destino planifica su día.
 */

function claseEstado(e: TripStatus) {
  switch (e) {
    case "PLANNED":
      return "bg-muted text-muted-foreground";
    case "IN_TRANSIT":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "ARRIVED":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "CANCELLED":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
  }
}

/** Qué se puede hacer desde cada estado. Un viaje no retrocede. */
const SIGUIENTES: Record<TripStatus, TripStatus[]> = {
  PLANNED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["ARRIVED", "CANCELLED"],
  ARRIVED: [],
  CANCELLED: [],
};

const VACIO = {
  flightNumber: "",
  carrierId: "",
  originWarehouseId: "",
  destinationWarehouseId: "",
  departureAt: "",
  arrivalAt: "",
};

export default function TripsPage() {
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [busy, setBusy] = useState(false);

  const [page, setPage] = useState(1);
  const { datos, recargar: cargar } = useApi<Paginated<Trip>>(
    `/warehouses/trips?page=${page}&pageSize=20`,
    { mensajeDeError: "Error cargando viajes", keepPreviousData: true },
  );
  const viajes = datos?.items ?? null;

  // Los catálogos no bloquean la lista y avisan en silencio: si fallan, el
  // formulario queda con menos opciones pero los viajes se siguen viendo.
  //
  // Cada uno con su clave, que además comparten con las pantallas de Bodegas y
  // de Transportistas: quien viene de una de ellas no las vuelve a pedir.
  const { datos: todasLasBodegas } = useApi<Warehouse[]>("/warehouses", {
    silencioso: true,
  });
  const { datos: todosLosTransportistas } = useApi<Carrier[]>("/carriers", {
    silencioso: true,
  });

  const bodegas = todasLasBodegas?.filter((b) => b.active) ?? [];
  const transportistas = todosLosTransportistas?.filter((c) => c.active) ?? [];

  async function crear(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/warehouses/trips", {
        method: "POST",
        body: JSON.stringify({
          ...(form.flightNumber.trim()
            ? { flightNumber: form.flightNumber.trim() }
            : {}),
          ...(form.carrierId ? { carrierId: form.carrierId } : {}),
          ...(form.originWarehouseId
            ? { originWarehouseId: form.originWarehouseId }
            : {}),
          ...(form.destinationWarehouseId
            ? { destinationWarehouseId: form.destinationWarehouseId }
            : {}),
          // `datetime-local` da "2026-08-20T14:00" sin zona. Se convierte a ISO
          // con la zona del navegador: mandarlo tal cual haría que el servidor
          // lo interpretara como UTC y el vuelo apareciera con horas de
          // diferencia según quién lo mire.
          ...(form.departureAt
            ? { departureAt: new Date(form.departureAt).toISOString() }
            : {}),
          ...(form.arrivalAt
            ? { arrivalAt: new Date(form.arrivalAt).toISOString() }
            : {}),
        }),
      });
      toast.success("Viaje creado");
      setForm(VACIO);
      setAbierto(false);
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  async function cambiarEstado(v: Trip, status: TripStatus) {
    setBusy(true);
    try {
      await api(`/warehouses/trips/${v.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(`Viaje ${TRIP_STATUS_LABELS[status].toLowerCase()}`);
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Viajes"
        actions={
          <Button onClick={() => setAbierto(true)}>
            <Plus className="size-4" />
            Nuevo viaje
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {datos ? `${datos.total} viaje(s)` : "Cargando…"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!viajes ? (
            <Skeleton className="h-40 w-full" />
          ) : viajes.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-6">
              <Plane className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Todavía no hay viajes. Un viaje es el vuelo que mueve la carga; a
                él se enganchan los manifiestos para saber cuándo llega cada uno
                y a qué bodega.
              </p>
              {bodegas.length === 0 && (
                <p className="text-sm text-amber-600">
                  Antes necesitas al menos una bodega de origen y una de destino.
                </p>
              )}
              <Button variant="outline" onClick={() => setAbierto(true)}>
                Crear el primero
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vuelo</TableHead>
                  <TableHead>Transportista</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead>Llegada</TableHead>
                  <TableHead className="text-right">Manifiestos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viajes.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono">
                      {v.flightNumber ?? "—"}
                    </TableCell>
                    <TableCell>{v.carrier?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {v.origin?.code ?? "?"} → {v.destination?.code ?? "?"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.departureAt
                        ? new Date(v.departureAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.arrivalAt
                        ? new Date(v.arrivalAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* La cifra lleva a los manifiestos: verla y no poder
                          abrirlos es lo que obliga a volver por el menú. */}
                      <Link
                        href="/manifests"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {v._count?.manifests ?? 0}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge className={claseEstado(v.status)}>
                        {TRIP_STATUS_LABELS[v.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {SIGUIENTES[v.status].map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={s === "CANCELLED" ? "ghost" : "outline"}
                          className="ml-1"
                          disabled={busy}
                          onClick={() => cambiarEstado(v, s)}
                        >
                          {s === "ARRIVED"
                            ? "Marcar arribado"
                            : s === "IN_TRANSIT"
                              ? "En tránsito"
                              : "Cancelar"}
                        </Button>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {datos ? (
        <Paginacion
          page={datos.page}
          pageSize={datos.pageSize}
          total={datos.total}
          onPage={setPage}
          etiqueta="viajes"
        />
      ) : null}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo viaje</DialogTitle>
          </DialogHeader>
          <form onSubmit={crear} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="flightNumber">Vuelo</Label>
                <Input
                  id="flightNumber"
                  placeholder="AA-1234"
                  className="font-mono"
                  value={form.flightNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, flightNumber: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Transportista</Label>
                <Select
                  value={form.carrierId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, carrierId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {transportistas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Sale de</Label>
                <Select
                  value={form.originWarehouseId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, originWarehouseId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Bodega de origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {bodegas.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Llega a</Label>
                <Select
                  value={form.destinationWarehouseId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, destinationWarehouseId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Bodega de destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {bodegas.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="departureAt">Salida</Label>
                <Input
                  id="departureAt"
                  type="datetime-local"
                  value={form.departureAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, departureAt: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="arrivalAt">Llegada estimada</Label>
                <Input
                  id="arrivalAt"
                  type="datetime-local"
                  value={form.arrivalAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, arrivalAt: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  La real se sella sola al marcar el viaje como arribado.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Creando…" : "Crear viaje"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
