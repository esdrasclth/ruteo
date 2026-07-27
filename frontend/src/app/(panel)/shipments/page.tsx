"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Package, Plus, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Paginated,
  Shipment,
  ShipmentStatus,
  ShipmentType,
} from "@/lib/api";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  // El dashboard enlaza aqui con un estado ya aplicado (ej. ?status=DELIVERED),
  // de modo que un KPI lleve directo a la lista que lo explica.
  const statusInicial = searchParams.get("status") ?? ALL;

  const [data, setData] = useState<Paginated<Shipment> | null>(null);
  const [status, setStatus] = useState<string>(statusInicial);
  const [type, setType] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);

  // Debounce del buscador: sin esto se lanza una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (status !== ALL) params.set("status", status);
    if (type !== ALL) params.set("type", type);
    if (busqueda) params.set("search", busqueda);
    try {
      setData(await api<Paginated<Shipment>>(`/shipments?${params}`));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando envíos",
      );
    }
  }, [page, status, type, busqueda]);

  useEffect(() => {
    load();
  }, [load]);

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
          onValueChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
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
          onValueChange={(v) => {
            setPage(1);
            setType(v);
          }}
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

      <Card>
        <CardContent className="p-0">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking</TableHead>
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
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/shipments/${s.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {s.trackingNumber}
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
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString("es-HN")}
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
