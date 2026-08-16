"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Devolucion,
  Paginated,
  ResumenDevoluciones,
  ReturnStatus,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  RETURN_DESTINATION_LABELS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_CLASSES,
  RETURN_STATUS_LABELS,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmtFecha = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("es-HN") : "—";

/**
 * Devoluciones.
 *
 * Lo que manda la pantalla es **por qué** vuelve la mercancía, no cuánta: el
 * total no obliga a hacer nada, y el reparto por motivo sí —si la mitad son
 * direcciones malas el problema está en el alta, y si son cargos sin pagar
 * está en el precio—.
 */
export default function ReturnsPage() {
  const [filtro, setFiltro] = useState<ReturnStatus | "TODAS">("PENDING");
  const [busy, setBusy] = useState(false);

  const q = filtro === "TODAS" ? "" : `&status=${filtro}`;

  const lista = useApi<Paginated<Devolucion>>(`/returns?pageSize=50${q}`, {
    mensajeDeError: "Error cargando devoluciones",
    // Cambiar de filtro ya no vacía la tabla: se queda la anterior atenuada
    // hasta que llega la nueva.
    keepPreviousData: true,
  });
  // El resumen NO depende del filtro, así que con su propia clave se pide una
  // vez y sobrevive a todos los cambios de pestaña. Antes el `Promise.all` lo
  // volvía a pedir entero cada vez.
  const res = useApi<ResumenDevoluciones>("/returns/resumen", {
    mensajeDeError: "Error cargando devoluciones",
  });

  const datos = lista.datos ?? null;
  const resumen = res.datos ?? null;

  const { recargar: recargarLista } = lista;
  const { recargar: recargarResumen } = res;
  const cargar = useCallback(async () => {
    await Promise.all([recargarLista(), recargarResumen()]);
  }, [recargarLista, recargarResumen]);

  async function accionar(id: string, accion: string, exito: string) {
    setBusy(true);
    try {
      await api(`/returns/${id}/${accion}`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      toast.success(exito);
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  const FILTROS: { valor: ReturnStatus | "TODAS"; etiqueta: string }[] = [
    { valor: "PENDING", etiqueta: "Pendientes" },
    { valor: "IN_TRANSIT", etiqueta: "En camino" },
    { valor: "COMPLETED", etiqueta: "Completadas" },
    { valor: "CANCELLED", etiqueta: "Canceladas" },
    { valor: "TODAS", etiqueta: "Todas" },
  ];

  const motivos = resumen
    ? Object.entries(resumen.porMotivo).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devoluciones"
        description="Mercancía que vuelve. El envío conserva su número de rastreo: una devolución no crea un envío nuevo."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sin cerrar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!resumen ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-semibold">{resumen.abiertas}</p>
            )}
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Por qué vuelven
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!resumen ? (
              <Skeleton className="h-8 w-full" />
            ) : motivos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay devoluciones.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {motivos.map(([motivo, n]) => (
                  <Badge key={motivo} variant="secondary">
                    {RETURN_REASON_LABELS[
                      motivo as keyof typeof RETURN_REASON_LABELS
                    ] ?? motivo}
                    : {n}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            size="sm"
            variant={filtro === f.valor ? "default" : "outline"}
            onClick={() => setFiltro(f.valor)}
          >
            {f.etiqueta}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {!datos ? (
            <Skeleton className="h-40 w-full" />
          ) : datos.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay devoluciones con este filtro.
            </p>
          ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Envío</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Vuelve</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Intentos</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Decidida</TableHead>
                    <TableHead className="w-48" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.items.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        {d.shipment ? (
                          <Link
                            href={`/shipments/${d.shipment.id}`}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {d.shipment.trackingNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{d.shipment?.recipientName ?? "—"}</TableCell>
                      <TableCell>
                        <span className="block">
                          {RETURN_DESTINATION_LABELS[d.destination]}
                        </span>
                        {d.warehouse && (
                          <span className="block text-xs text-muted-foreground">
                            {d.warehouse.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{RETURN_REASON_LABELS[d.reason]}</TableCell>
                      {/* La cifra que justifica haberse rendido. Se guardó al
                          decidir, así que no cambia si después se tocan los
                          intentos. */}
                      <TableCell>{d.attemptsBefore ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={RETURN_STATUS_CLASSES[d.status]}>
                          {RETURN_STATUS_LABELS[d.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmtFecha(d.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          {d.status === "PENDING" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                accionar(d.id, "enviar", "Devolución en camino")
                              }
                            >
                              Enviar
                            </Button>
                          )}
                          {(d.status === "PENDING" ||
                            d.status === "IN_TRANSIT") && (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  accionar(
                                    d.id,
                                    "completar",
                                    "Devolución completada",
                                  )
                                }
                              >
                                Completar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  accionar(
                                    d.id,
                                    "cancelar",
                                    "Devolución cancelada",
                                  )
                                }
                              >
                                Cancelar
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
