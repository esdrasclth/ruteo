"use client";

import { FormEvent, use, useState } from "react";
import Link from "next/link";
import {
  Image as ImageIcon,
  MapPin,
  PenLine,
  Plus,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  DeliveryFailureReason,
  MOTIVOS_DE_FALLO,
  RoadRoute,
  RouteDetail,
  RouteStop,
  Shipment,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { BuscadorRemoto, itemsDe } from "@/components/buscador-remoto";
import { STATUS_LABELS, statusBadgeClass } from "@/lib/shipment-status";
import {
  ROUTE_NEXT_STATUSES,
  ROUTE_STATUS_LABELS,
  STOP_STATUS_LABELS,
  STOP_TYPE_LABELS,
  routeStatusBadgeClass,
  stopStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { NoExiste } from "@/components/no-existe";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { StopsMap } from "@/components/stops-map";
import { SubirArchivo } from "@/components/subir-archivo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function RouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [shipmentId, setShipmentId] = useState("");
  const [envioElegido, setEnvioElegido] = useState<Shipment | null>(null);

  const [completeStop, setCompleteStop] = useState<RouteStop | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [failStop, setFailStop] = useState<RouteStop | null>(null);
  const [failureReason, setFailureReason] = useState<DeliveryFailureReason | "">(
    "",
  );
  const [failNotes, setFailNotes] = useState("");
  // Claves del almacenamiento, no URLs: la foto ya está subida cuando esto se
  // llena, y lo único que viaja al backend al cerrar la parada es la clave.
  const [fotoEntrega, setFotoEntrega] = useState<string | null>(null);
  const [fotoFallo, setFotoFallo] = useState<string | null>(null);

  const { datos: datosRuta, error, recargar: load } = useApi<RouteDetail>(
    `/routes/${id}`,
    {
      mensajeDeError: "Error cargando la ruta",
      // El 404 ya lo explica la pantalla entera; un aviso rojo encima sobra.
      silencioso: (e) => e.status === 404,
    },
  );
  const route = datosRuta ?? null;

  // El trazado por carretera va aparte y sin bloquear: la ruta se muestra igual
  // aunque OSRM esté apagado, solo que con líneas rectas. Con su propia clave,
  // además, no se vuelve a pedir cada vez que se cierra una parada.
  const { datos: datosCarretera } = useApi<RoadRoute | null>(
    `/routing/route/${id}`,
    { silencioso: true },
  );
  const carretera = datosCarretera ?? null;

  // Las paradas que ya tiene la ruta, para no volver a ofrecerlas.
  const yaEnRuta = new Set((route?.stops ?? []).map((s) => s.shipmentId));

  // Abrir ya no precarga una lista: el buscador consulta al teclear.
  function openAddStop() {
    setEnvioElegido(null);
    setShipmentId("");
    setAddOpen(true);
  }

  async function onAddStop(e: FormEvent) {
    e.preventDefault();
    if (!shipmentId) return;
    const shipment = envioElegido;
    setBusy(true);
    try {
      await api(`/routes/${id}/stops`, {
        method: "POST",
        body: JSON.stringify({
          shipmentId,
          addressLabel: shipment?.destinationLabel ?? undefined,
          lat: shipment?.destinationLat ?? undefined,
          lng: shipment?.destinationLng ?? undefined,
        }),
      });
      toast.success("Parada agregada");
      setAddOpen(false);
      setShipmentId("");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo agregar la parada",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onOptimize() {
    setBusy(true);
    try {
      await api(`/routes/${id}/optimize`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast.success("Ruta optimizada");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo optimizar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRouteStatus(status: string) {
    setBusy(true);
    try {
      await api(`/routes/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success("Estado de ruta actualizado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cambiar el estado",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onArrive(stop: RouteStop) {
    setBusy(true);
    try {
      await api(`/routes/${id}/stops/${stop.id}/arrive`, { method: "PATCH" });
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo marcar llegada",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onComplete(e: FormEvent) {
    e.preventDefault();
    if (!completeStop) return;
    setBusy(true);
    try {
      await api(`/routes/${id}/stops/${completeStop.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          ...(receivedBy.trim() ? { receivedBy: receivedBy.trim() } : {}),
          ...(fotoEntrega ? { photoKey: fotoEntrega } : {}),
        }),
      });
      toast.success("Parada completada");
      setCompleteStop(null);
      setReceivedBy("");
      setFotoEntrega(null);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo completar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onFail(e: FormEvent) {
    e.preventDefault();
    if (!failStop || !failureReason) return;
    // El backend lo vuelve a comprobar; esto sólo evita el viaje de ida y vuelta
    // para enterarse de algo que ya se sabe aquí.
    if (failureReason === "OTHER" && !failNotes.trim()) {
      toast.error("Explica qué pasó cuando el motivo es «Otro motivo».");
      return;
    }
    setBusy(true);
    try {
      await api(`/routes/${id}/stops/${failStop.id}/fail`, {
        method: "POST",
        body: JSON.stringify({
          failureReason,
          ...(failNotes.trim() ? { notes: failNotes.trim() } : {}),
          ...(fotoFallo ? { photoKey: fotoFallo } : {}),
        }),
      });
      toast.success("Parada marcada como fallida");
      setFailStop(null);
      setFailureReason("");
      setFailNotes("");
      setFotoFallo(null);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo registrar el fallo",
      );
    } finally {
      setBusy(false);
    }
  }

  // Un 404 no es «sigue cargando»: sin esto la pantalla se quedaba en
  // esqueleto para siempre, que es lo que peor se lee de todos los estados.
  if (error?.status === 404) {
    return (
      <NoExiste
        recurso="la ruta"
        volverA="/routes"
        etiquetaVolver="Ver todas las rutas"
      />
    );
  }

  if (!route) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const nexts = ROUTE_NEXT_STATUSES[route.status];
  const canEditStops = route.status === "PLANNED";

  // Solo las paradas con coordenadas se pueden dibujar. Las que no las tienen
  // se cuentan aparte para no dejar al usuario preguntándose por qué faltan.
  const paradasGeo = route.stops
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => ({
      sequence: s.sequence,
      lat: s.lat as number,
      lng: s.lng as number,
      label: s.addressLabel ?? s.shipment.trackingNumber,
      status: s.status,
    }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[
          { label: "Rutas", href: "/routes" },
          { label: route.code },
        ]}
        title={<span className="font-mono">{route.code}</span>}
        description={`${route.driver?.name ?? "Sin repartidor"} · ${new Date(
          route.scheduledDate,
        ).toLocaleDateString("es-HN", { timeZone: "UTC" })}`}
        actions={
          <div className="flex items-center gap-2">
          <Badge className={routeStatusBadgeClass(route.status)}>
            {ROUTE_STATUS_LABELS[route.status]}
          </Badge>
          {nexts.map((s) => (
            <Button
              key={s}
              variant={s === "CANCELLED" ? "outline" : "default"}
              size="sm"
              disabled={busy}
              onClick={() => onRouteStatus(s)}
            >
              {ROUTE_STATUS_LABELS[s]}
            </Button>
          ))}
          </div>
        }
      />

      {paradasGeo.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recorrido</CardTitle>
            {carretera ? (
              <span className="text-sm tabular-nums text-muted-foreground">
                <span className="font-medium text-primary">
                  {carretera.distanceKm} km
                </span>{" "}
                · {carretera.durationMin} min por carretera
              </span>
            ) : null}
          </CardHeader>
          <CardContent>
            <StopsMap
              paradas={paradasGeo}
              carretera={carretera?.geometry ?? null}
            />
            {paradasGeo.length < route.stops.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {route.stops.length - paradasGeo.length} parada(s) sin
                coordenadas no aparecen en el mapa.
              </p>
            ) : null}
            {!carretera && paradasGeo.length > 1 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Trazado por calles no disponible: se muestra el orden de las
                paradas en línea recta.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden pb-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Paradas ({route.stops.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || route.stops.length < 2 || !canEditStops}
              onClick={onOptimize}
            >
              <Wand2 className="size-4" />
              Optimizar orden
            </Button>
            <Button
              size="sm"
              disabled={!canEditStops}
              onClick={openAddStop}
            >
              <Plus className="size-4" />
              Agregar parada
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {route.stops.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Sin paradas. Agrega envíos a la ruta.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Envío</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>POD</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {route.stops.map((stop) => (
                  <TableRow key={stop.id}>
                    <TableCell>{stop.sequence}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        {/* La parada es el punto donde el repartidor necesita
                            abrir el envio; sin este enlace hay que buscarlo. */}
                        <Link
                          href={`/shipments/${stop.shipmentId}`}
                          className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {stop.shipment.trackingNumber}
                        </Link>
                        <Badge
                          className={`${statusBadgeClass(stop.shipment.status)} mt-1 w-fit`}
                        >
                          {STATUS_LABELS[stop.shipment.status]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>{STOP_TYPE_LABELS[stop.type]}</TableCell>
                    <TableCell className="max-w-48">
                      <span className="flex items-center gap-1 truncate text-sm">
                        {stop.addressLabel ? (
                          <>
                            <MapPin className="size-3 shrink-0 text-muted-foreground" />
                            {stop.addressLabel}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={stopStatusBadgeClass(stop.status)}>
                        {STOP_STATUS_LABELS[stop.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-40 text-muted-foreground">
                      {stop.pod ? (
                        <div className="flex flex-col gap-1">
                          {/* El número es POR ENVÍO: «intento 3» en la parada de
                              hoy dice que a este paquete ya se fue dos veces
                              antes, que es lo que la parada sola no sabe. Sólo
                              se enseña a partir del segundo, porque marcar
                              «intento 1» en todas las entregas normales sería
                              ruido. */}
                          {stop.attempts.some((a) => a.attemptNumber > 1) && (
                            <Badge
                              variant="outline"
                              className="w-fit border-amber-300 text-amber-700 dark:text-amber-400"
                            >
                              Intento{" "}
                              {Math.max(
                                ...stop.attempts.map((a) => a.attemptNumber),
                              )}
                            </Badge>
                          )}
                          <span className="truncate">
                            {stop.pod.receivedBy ??
                              stop.pod.failureReason ??
                              "Registrada"}
                          </span>
                          {/* La URL viene firmada y dura pocos minutos: se abre
                              en una pestaña en vez de incrustarse, para que una
                              pantalla abierta media hora no acabe llena de
                              imágenes rotas. */}
                          {stop.pod.photoUrl && (
                            <a
                              href={stop.pod.photoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex w-fit items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                            >
                              <ImageIcon className="size-3" aria-hidden />
                              Ver foto
                            </a>
                          )}
                          {stop.pod.signatureUrl && (
                            <a
                              href={stop.pod.signatureUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex w-fit items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                            >
                              <PenLine className="size-3" aria-hidden />
                              Ver firma
                            </a>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {route.status === "IN_PROGRESS" ? (
                        <div className="flex justify-end gap-1">
                          {stop.status === "PENDING" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => onArrive(stop)}
                            >
                              Llegué
                            </Button>
                          ) : null}
                          {stop.status === "ARRIVED" ? (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => setCompleteStop(stop)}
                              >
                                Entregar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setFailStop(stop)}
                              >
                                Falló
                              </Button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar parada</DialogTitle>
          </DialogHeader>
          <form onSubmit={onAddStop} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="envio-parada">Envío *</Label>
              {/* Buscador y no desplegable: se traía una página de cien envíos
                  y se filtraba aquí, así que en una operación con más el que
                  buscabas no aparecía y nada lo explicaba. Ahora se teclea la
                  guía o el destinatario y pregunta al servidor. */}
              <BuscadorRemoto<Shipment>
                id="envio-parada"
                ruta={(q) =>
                  `/shipments?search=${encodeURIComponent(q)}&pageSize=20`
                }
                extraer={(d) =>
                  // Los que ya están en la ruta o ya terminaron no se ofrecen:
                  // el backend los aceptaría y crearía una parada sin sentido.
                  itemsDe<Shipment>(d).filter(
                    (s) =>
                      !yaEnRuta.has(s.id) &&
                      !["DELIVERED", "CANCELLED", "RETURNED"].includes(s.status),
                  )
                }
                etiqueta={(s) => s.trackingNumber}
                detalle={(s) =>
                  [s.recipientName, s.destinationLabel]
                    .filter(Boolean)
                    .join(" · ")
                }
                elegido={envioElegido}
                onElegir={(s) => {
                  setEnvioElegido(s);
                  setShipmentId(s?.id ?? "");
                }}
                placeholder="Buscar por guía, destinatario o destino…"
              />
                            <p className="text-xs text-muted-foreground">
                No se ofrecen los que ya están en esta ruta ni los que ya
                terminaron.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !shipmentId}>
                Agregar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!completeStop}
        onOpenChange={(o) => !o && setCompleteStop(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Completar entrega — {completeStop?.shipment.trackingNumber}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onComplete} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="receivedBy">Recibido por (opcional)</Label>
              <Input
                id="receivedBy"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
              />
            </div>
            {/* `key` con el id de la parada: sin él, React reutiliza el mismo
                componente al abrir el diálogo de otra parada y la foto de la
                anterior seguiría marcada como subida. */}
            {completeStop && (
              <SubirArchivo
                key={completeStop.id}
                categoria="prueba-entrega"
                propietarioId={completeStop.id}
                onSubido={(a) => setFotoEntrega(a?.clave ?? null)}
                etiqueta="Foto de la entrega (opcional)"
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Confirmar entrega
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!failStop} onOpenChange={(o) => !o && setFailStop(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Registrar fallo — {failStop?.shipment.trackingNumber}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onFail} className="grid gap-4">
            {/* Lista cerrada y no texto libre: «no estaba», «ausente» y
                «nadie en casa» son la misma causa escrita de tres formas, y así
                no se puede contar cuántas entregas fallan por cada motivo. */}
            <div className="grid gap-2">
              <Label htmlFor="failureReason">Motivo *</Label>
              <Select
                value={failureReason}
                onValueChange={(v) =>
                  setFailureReason(v as DeliveryFailureReason)
                }
              >
                <SelectTrigger id="failureReason">
                  <SelectValue placeholder="Elige el motivo" />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(MOTIVOS_DE_FALLO) as DeliveryFailureReason[]
                  ).map((m) => (
                    <SelectItem key={m} value={m}>
                      {MOTIVOS_DE_FALLO[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="failNotes">
                Detalle {failureReason === "OTHER" ? "*" : "(opcional)"}
              </Label>
              <Input
                id="failNotes"
                required={failureReason === "OTHER"}
                placeholder="Dejó dicho que pasemos por la tarde"
                value={failNotes}
                onChange={(e) => setFailNotes(e.target.value)}
              />
              {failureReason === "OTHER" && (
                <p className="text-xs text-muted-foreground">
                  «Otro motivo» sin explicación no se puede revisar después.
                </p>
              )}
            </div>
            {/* La evidencia del fallo es la que más falta hace: una entrega
                buena rara vez se discute, la que no se pudo hacer sí. */}
            {failStop && (
              <SubirArchivo
                key={failStop.id}
                categoria="prueba-entrega"
                propietarioId={failStop.id}
                onSubido={(a) => setFotoFallo(a?.clave ?? null)}
                etiqueta="Foto del intento (opcional)"
              />
            )}
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={busy}>
                Registrar fallo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
