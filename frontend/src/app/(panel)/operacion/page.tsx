"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  MapPin,
  PackageSearch,
  RefreshCw,
  Scale,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, TableroOperacion } from "@/lib/api";
import {
  EXCEPTION_SEVERITY_LABELS,
  EXCEPTION_TYPE_LABELS,
  severityBadgeClass,
} from "@/lib/fase2";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * El tablero de operación (§6 del plan).
 *
 * Responde «qué está pasando ahora», que es otra pregunta que la del dashboard
 * —«cómo nos fue»— y por eso es otra pantalla y no una pestaña de aquélla. No
 * tiene selector de fechas a propósito: un bulto parado en aduana desde marzo es
 * exactamente el que hay que ver, y cualquier ventana razonable lo escondería.
 */

/** Una cifra grande con su enlace a la pantalla donde se actúa. */
function Cifra({
  valor,
  etiqueta,
  href,
  alerta,
  nota,
}: {
  valor: number | string;
  etiqueta: string;
  href?: string;
  alerta?: boolean;
  nota?: string;
}) {
  const cuerpo = (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        href ? "hover:bg-accent" : ""
      } ${alerta ? "border-destructive/40" : ""}`}
    >
      <p
        className={`text-2xl font-semibold tabular-nums ${
          alerta ? "text-destructive" : ""
        }`}
      >
        {valor}
      </p>
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
      {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
  // Cada cifra lleva a donde se actúa sobre ella. Un tablero que sólo informa
  // obliga a buscar a mano lo que acaba de señalar.
  return href ? (
    <Link href={href} className="block">
      {cuerpo}
    </Link>
  ) : (
    cuerpo
  );
}

export default function OperacionPage() {
  const [tablero, setTablero] = useState<TableroOperacion | null>(null);
  const [cargando, setCargando] = useState(true);

  const load = useCallback(async () => {
    try {
      setTablero(await api<TableroOperacion>("/analytics/operacion"));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cargar el tablero",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (cargando || !tablero) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  const { bodegas, aduana, excepciones, ultimaMilla } = tablero;
  const totalBultos =
    bodegas.detalle.reduce((t, b) => t + b.bultos, 0) + bodegas.sinUbicar;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Tablero de operación"
        description="Dónde está la carga ahora mismo y qué necesita que alguien lo mire."
        actions={
          <div className="flex items-center gap-3">
            {/* La hora importa: es una foto, y quien la mira tiene que saber de
                cuándo es antes de tomar una decisión con ella. */}
            <span className="text-xs text-muted-foreground">
              {new Date(tablero.generadoEn).toLocaleTimeString("es-HN")}
            </span>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="size-4" aria-hidden />
              Actualizar
            </Button>
          </div>
        }
      />

      {/* Lo que necesita atención va PRIMERO. Un tablero que abre con los
          totales obliga a buscar el problema entre cifras que están bien. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4" aria-hidden />
            Necesita atención
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra
            valor={excepciones.abiertas}
            etiqueta="Excepciones abiertas"
            href="/exceptions"
            alerta={excepciones.abiertas > 0}
            nota={
              excepciones.sinAsignar > 0
                ? `${excepciones.sinAsignar} sin asignar a nadie`
                : undefined
            }
          />
          <Cifra
            valor={aduana.retenidos}
            etiqueta="Retenidos en aduana"
            href="/customs"
            alerta={aduana.retenidos > 0}
            nota="No avanzan y cuestan cada día"
          />
          <Cifra
            valor={ultimaMilla.porReintentar}
            etiqueta="Por reintentar"
            href="/shipments?status=FAILED_ATTEMPT"
            alerta={ultimaMilla.porReintentar > 0}
            nota="Volvieron tras un intento fallido"
          />
          <Cifra
            valor={bodegas.sinUbicar}
            etiqueta="Bultos sin ubicar"
            href="/lockers"
            alerta={bodegas.sinUbicar > 0}
            nota="En bodega, pero sin decir en cuál"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="size-4" aria-hidden />
              Dónde está la carga
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {bodegas.detalle.length === 0 && bodegas.sinUbicar === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay bultos en bodega ahora mismo.
              </p>
            ) : (
              <>
                {bodegas.detalle.map((b) => (
                  <div
                    key={b.warehouseId}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {b.name ?? "Bodega"}{" "}
                        <span className="text-muted-foreground">{b.code}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.country}
                      </p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums">
                      {b.bultos}
                    </span>
                  </div>
                ))}
                {/* Se enseña aunque sea cero cuando hay carga: si desapareciera,
                    el tablero mostraría bodegas vacías y parecería que no hay
                    nada, cuando lo que pasa es que nadie ubicó los bultos. */}
                {bodegas.sinUbicar > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3">
                    <div>
                      <p className="text-sm font-medium">Sin bodega asignada</p>
                      <p className="text-xs text-muted-foreground">
                        La recepción todavía no pregunta en cuál se recibe
                      </p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums">
                      {bodegas.sinUbicar}
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {totalBultos} bulto{totalBultos === 1 ? "" : "s"} en total.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="size-4" aria-hidden />
              Aduana
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Cifra valor={aduana.pendientes} etiqueta="Pendientes" />
            <Cifra valor={aduana.enRevision} etiqueta="En revisión" />
            <Cifra
              valor={aduana.retenidos}
              etiqueta="Retenidos"
              alerta={aduana.retenidos > 0}
            />
            <Cifra valor={aduana.liberados} etiqueta="Liberados" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="size-4" aria-hidden />
              Última milla
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Cifra
              valor={ultimaMilla.enRuta}
              etiqueta="En ruta ahora"
              href="/routes"
            />
            <Cifra valor={ultimaMilla.enBodega} etiqueta="En bodega, sin salir" />
            <Cifra valor={ultimaMilla.enTransito} etiqueta="En tránsito" />
            {/* Nulo y no 0%: sin entregas la pregunta no tiene respuesta
                todavía, y un 0% se lee como que se entregó mal. */}
            <Cifra
              valor={
                ultimaMilla.tasaPrimerIntento30Dias === null
                  ? "—"
                  : `${ultimaMilla.tasaPrimerIntento30Dias}%`
              }
              etiqueta="Entregas al primer intento"
              nota={`${ultimaMilla.entregas30Dias} entrega${
                ultimaMilla.entregas30Dias === 1 ? "" : "s"
              } en 30 días`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageSearch className="size-4" aria-hidden />
              Excepciones abiertas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {excepciones.abiertas === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ninguna abierta. Nada que perseguir.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {excepciones.porSeveridad.map((s) => (
                    <Badge
                      key={s.severidad}
                      variant="outline"
                      className={severityBadgeClass(s.severidad)}
                    >
                      {EXCEPTION_SEVERITY_LABELS[s.severidad]}: {s.cuantas}
                    </Badge>
                  ))}
                </div>
                {excepciones.porTipo.map((t) => (
                  <div
                    key={t.tipo}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-muted-foreground">
                      {EXCEPTION_TYPE_LABELS[t.tipo]}
                    </span>
                    <span className="font-medium tabular-nums">{t.cuantas}</span>
                  </div>
                ))}
                <Link
                  href="/exceptions"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver la bandeja
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
