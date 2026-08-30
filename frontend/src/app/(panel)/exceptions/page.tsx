"use client";

import { FormEvent, Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  api,
  ApiError,
  ExceptionRow,
  ExceptionStatus,
  Paginated,
  ResumenExcepciones,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  EXCEPTION_SEVERITY_LABELS,
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_TYPE_LABELS,
  exceptionStatusBadgeClass,
  severityBadgeClass,
} from "@/lib/fase2";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MobileList,
  MobileListCard,
  MobileListMeta,
} from "@/components/responsive-list";
import { opcionDesdeUrl, useUrlFilters } from "@/lib/use-url-filters";

/**
 * Bandeja de excepciones.
 *
 * Es una lista de trabajo, no un histórico: por defecto muestra lo que sigue
 * abierto, y el backend ordena por estado y severidad para que un faltante grave
 * de ayer no quede debajo de una diferencia de peso de hoy.
 */
export default function ExceptionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <ExceptionsContent />
    </Suspense>
  );
}

function ExceptionsContent() {
  const { searchParams, actualizar } = useUrlFilters();
  const filtro = opcionDesdeUrl<ExceptionStatus | "TODAS">(
    searchParams,
    "status",
    ["OPEN", "INVESTIGATING", "TODAS"],
    "OPEN",
  );
  const [cerrando, setCerrando] = useState<ExceptionRow | null>(null);
  const [resolucion, setResolucion] = useState("");
  const [busy, setBusy] = useState(false);

  const q = filtro === "TODAS" ? "" : `&status=${filtro}`;

  const lista = useApi<Paginated<ExceptionRow>>(
    `/exceptions?page=1&pageSize=50${q}`,
    { mensajeDeError: "Error cargando excepciones", keepPreviousData: true },
  );
  // El resumen NO depende del filtro: con su propia clave se pide una vez y
  // sobrevive a los cambios de pestaña, en vez de volver a pedirse con la lista.
  const res = useApi<ResumenExcepciones>("/exceptions/resumen", {
    mensajeDeError: "Error cargando excepciones",
  });

  const datos = lista.datos ?? null;
  const resumen = res.datos ?? null;

  const { recargar: recargarLista } = lista;
  const { recargar: recargarResumen } = res;
  const cargar = useCallback(async () => {
    await Promise.all([recargarLista(), recargarResumen()]);
  }, [recargarLista, recargarResumen]);

  async function cambiarEstado(fila: ExceptionRow, status: ExceptionStatus) {
    // Cerrar exige explicar cómo se resolvió —lo impone el backend— así que se
    // pide antes en vez de mandar la petición y enseñar el error.
    if (status === "RESOLVED" || status === "WRITTEN_OFF") {
      setCerrando(fila);
      return;
    }
    await guardar(fila.id, { status });
  }

  async function guardar(id: string, cambios: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/exceptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(cambios),
      });
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCerrar(e: FormEvent) {
    e.preventDefault();
    if (!cerrando || !resolucion.trim()) return;
    await guardar(cerrando.id, {
      status: "RESOLVED",
      resolution: resolucion.trim(),
    });
    setCerrando(null);
    setResolucion("");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Excepciones"
        description="Diferencias detectadas al cotejar lo que llegó contra lo que venía declarado."
        actions={
          <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto">
          {(["OPEN", "INVESTIGATING", "TODAS"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filtro === f ? "default" : "outline"}
              onClick={() =>
                actualizar(
                  { status: f === "OPEN" ? null : f, page: null },
                  "push",
                )
              }
            >
              {f === "TODAS" ? "Todas" : EXCEPTION_STATUS_LABELS[f]}
            </Button>
          ))}
          </div>
        }
      />

      {resumen && resumen.abiertas > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-6 py-4 text-sm">
            <span>
              <strong className="text-2xl">{resumen.abiertas}</strong> sin
              cerrar
            </span>
            {(["HIGH", "MEDIUM", "LOW"] as const).map((s) =>
              resumen.porSeveridad[s] ? (
                <span key={s} className="self-center">
                  <Badge className={severityBadgeClass(s)}>
                    {EXCEPTION_SEVERITY_LABELS[s]}
                  </Badge>{" "}
                  {resumen.porSeveridad[s]}
                </span>
              ) : null,
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base" aria-live="polite">
            {datos ? `${datos.total} excepción(es)` : "Cargando…"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-6" aria-busy={!datos}>
          {!datos ? (
            <Skeleton className="m-4 h-40 w-[calc(100%-2rem)] md:m-0 md:w-full" />
          ) : datos.items.length === 0 ? (
            <p role="status" className="p-4 text-sm text-muted-foreground md:p-0">
              Nada pendiente. Las diferencias del cotejo de manifiestos aparecen
              aquí automáticamente.
            </p>
          ) : (
            <>
              <MobileList label="Excepciones">
                {datos.items.map((x) => (
                  <MobileListCard key={x.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {EXCEPTION_TYPE_LABELS[x.type]}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {x.description}
                        </p>
                      </div>
                      <Badge className={severityBadgeClass(x.severity)}>
                        {EXCEPTION_SEVERITY_LABELS[x.severity]}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge className={exceptionStatusBadgeClass(x.status)}>
                        {EXCEPTION_STATUS_LABELS[x.status]}
                      </Badge>
                      <MobileListMeta label="Referencia">
                        {x.shipment ? (
                          <Link
                            href={`/shipments/${x.shipment.id}`}
                            className="font-mono underline underline-offset-2"
                          >
                            {x.shipment.trackingNumber}
                          </Link>
                        ) : x.manifest ? (
                          <Link
                            href={`/manifests/${x.manifest.id}`}
                            className="underline underline-offset-2"
                          >
                            {x.manifest.number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </MobileListMeta>
                    </div>
                    {(x.status === "OPEN" ||
                      x.status === "INVESTIGATING") && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {x.status === "OPEN" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => cambiarEstado(x, "INVESTIGATING")}
                          >
                            Revisar
                          </Button>
                        ) : (
                          <span />
                        )}
                        <Button
                          size="sm"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => cambiarEstado(x, "RESOLVED")}
                        >
                          Cerrar
                        </Button>
                      </div>
                    )}
                  </MobileListCard>
                ))}
              </MobileList>
              <div className="hidden md:block">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Esperado / real</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.items.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell>{EXCEPTION_TYPE_LABELS[x.type]}</TableCell>
                    <TableCell className="max-w-64">
                      <span className="block truncate">{x.description}</span>
                      {x.resolution && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {x.resolution}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {x.expectedValue && x.actualValue ? (
                        <>
                          <span className="block">{x.expectedValue}</span>
                          <span className="block font-medium text-foreground">
                            {x.actualValue}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {x.shipment ? (
                        <Link
                          href={`/shipments/${x.shipment.id}`}
                          className="font-mono underline-offset-2 hover:underline"
                        >
                          {x.shipment.trackingNumber}
                        </Link>
                      ) : x.manifest ? (
                        <Link
                          href={`/manifests/${x.manifest.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {x.manifest.number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={severityBadgeClass(x.severity)}>
                        {EXCEPTION_SEVERITY_LABELS[x.severity]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={exceptionStatusBadgeClass(x.status)}>
                        {EXCEPTION_STATUS_LABELS[x.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {x.status === "OPEN" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => cambiarEstado(x, "INVESTIGATING")}
                        >
                          Revisar
                        </Button>
                      )}
                      {(x.status === "OPEN" ||
                        x.status === "INVESTIGATING") && (
                        <Button
                          size="sm"
                          className="ml-1"
                          disabled={busy}
                          onClick={() => cambiarEstado(x, "RESOLVED")}
                        >
                          Cerrar
                        </Button>
                      )}
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

      <Dialog open={!!cerrando} onOpenChange={(o) => !o && setCerrando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar excepción</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCerrar} className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              {cerrando?.description}
            </p>
            <div className="grid gap-2">
              <Label htmlFor="resolucion">¿Cómo se resolvió? *</Label>
              <Input
                id="resolucion"
                required
                placeholder="El transportista confirmó el reembolso"
                value={resolucion}
                onChange={(e) => setResolucion(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sin esto, «resuelta» no distingue entre se arregló y alguien se
                cansó de verla en la lista.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Cerrar excepción
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
