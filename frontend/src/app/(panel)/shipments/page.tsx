"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Package, Plus, Search, Upload, X } from "lucide-react";
import {
  Paginated,
  Shipment,
  ShipmentStatus,
  ShipmentType,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  STATUS_LABELS,
  TYPE_LABELS,
  statusBadgeClass,
} from "@/lib/shipment-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
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
  useUrlSearch,
} from "@/lib/use-url-filters";

const ALL = "ALL";
const PAGE_SIZE = 20;

// `useSearchParams` exige frontera Suspense para no romper el build estatico.
export default function ShipmentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <ShipmentsContent />
    </Suspense>
  );
}

function ShipmentsContent() {
  const { searchParams, actualizar } = useUrlFilters();
  // El dashboard enlaza aqui con un estado ya aplicado (ej. ?status=DELIVERED),
  // de modo que un KPI lleve directo a la lista que lo explica.
  const status = opcionDesdeUrl(
    searchParams,
    "status",
    [ALL, ...Object.keys(STATUS_LABELS)],
    ALL,
  );
  // Lo mismo para el tipo, que el desglose «Por tipo» del inicio enlaza igual.
  // Sin esto el enlace navegaba hasta aquí pero no filtraba nada, que es peor
  // que no enlazar: parece que la lista está mal, no que falte el filtro.
  const type = opcionDesdeUrl(
    searchParams,
    "type",
    [ALL, ...Object.keys(TYPE_LABELS)],
    ALL,
  );
  const page = paginaDesdeUrl(searchParams);
  const {
    borrador: search,
    setBorrador: setSearch,
    aplicado: busqueda,
  } = useUrlSearch();

  // La consulta se arma en el render, no dentro de la carga: ES la clave de
  // caché. Dos visitas con los mismos filtros son la misma clave, así que
  // volver a esta pantalla pinta al instante lo que ya se había traído.
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (status !== ALL) params.set("status", status);
  if (type !== ALL) params.set("type", type);
  if (busqueda) params.set("search", busqueda);

  const { datos } = useApi<Paginated<Shipment>>(
    `/shipments?${params}`,
    {
      mensajeDeError: "Error cargando envíos",
      // Al pasar de página la tabla no se vacía: se queda la anterior mientras
      // llega la siguiente. Antes parpadeaba a esqueleto en cada clic.
      keepPreviousData: true,
    },
  );
  const data = datos ?? null;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Envíos"
        description={
          data
            ? `${data.total} envío${data.total === 1 ? "" : "s"}${
                busqueda ? ` para “${busqueda}”` : ""
              }`
            : "Cargando…"
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/shipments/import">
                <Upload className="size-4" />
                Importar CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/shipments/new">
                <Plus className="size-4" />
                Nuevo envío
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Guía, destinatario, teléfono o destino…"
            className="bg-card pl-9"
            aria-label="Buscar envíos"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Select
          value={status}
          onValueChange={(v) =>
            actualizar({ status: v === ALL ? null : v, page: null }, "push")
          }
        >
          <SelectTrigger className="w-52 bg-card">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {(Object.keys(STATUS_LABELS) as ShipmentStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={type}
          onValueChange={(v) =>
            actualizar({ type: v === ALL ? null : v, page: null }, "push")
          }
        >
          <SelectTrigger className="w-44 bg-card">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {(Object.keys(TYPE_LABELS) as ShipmentType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0" aria-busy={!data}>
          {!data ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Sin envíos"
              description={
                busqueda
                  ? `Ningún envío coincide con “${busqueda}”.`
                  : "No hay envíos que coincidan con los filtros seleccionados."
              }
              action={
                <Button asChild size="sm">
                  <Link href="/shipments/new">
                    <Plus className="size-4" />
                    Nuevo envío
                  </Link>
                </Button>
              }
            />
          ) : (
            <>
              <MobileList label="Envíos">
                {data.items.map((s) => (
                  <MobileListCard
                    key={s.id}
                    href={`/shipments/${s.id}`}
                    label={`Abrir envío ${s.trackingNumber} de ${s.recipientName}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">
                          {s.trackingNumber}
                        </p>
                        <p className="mt-0.5 truncate text-sm">
                          {s.recipientName}
                        </p>
                      </div>
                      <Badge className={statusBadgeClass(s.status)}>
                        {STATUS_LABELS[s.status]}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <MobileListMeta label="Tipo">
                        {TYPE_LABELS[s.type]}
                      </MobileListMeta>
                      <MobileListMeta label="Destino">
                        <span className="max-w-48 truncate">
                          {s.destinationLabel ?? "—"}
                        </span>
                      </MobileListMeta>
                      {s.codAmount ? (
                        <MobileListMeta label="Cobro contra entrega">
                          {s.codAmount} {s.currency}
                        </MobileListMeta>
                      ) : null}
                    </div>
                  </MobileListCard>
                ))}
              </MobileList>
              <div className="hidden md:block">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guía</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-right">COD</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/shipments/${s.id}`}
                        className="font-mono font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {s.trackingNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{s.recipientName}</TableCell>
                    <TableCell>{TYPE_LABELS[s.type]}</TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(s.status)}>
                        {STATUS_LABELS[s.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-40 truncate">
                      {s.destinationLabel ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.codAmount ? `${s.codAmount} ${s.currency}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString("es-HN")}
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
