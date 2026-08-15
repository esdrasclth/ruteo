"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Clock,
  FileSearch,
  Lock,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Route,
  Scale,
  Target,
  Truck,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, TableroOperacion } from "@/lib/api";
import {
  EXCEPTION_SEVERITY_LABELS,
  EXCEPTION_TYPE_LABELS,
  severityBadgeClass,
} from "@/lib/fase2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cifra, GrupoCifras } from "@/components/cifra";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * La mitad «ahora» de la pantalla de inicio (§6 del plan): dónde está la carga
 * en este momento y qué necesita que alguien lo mire.
 *
 * **No tiene selector de fechas, y por eso vive separada de la mitad de abajo.**
 * Un bulto parado en aduana desde marzo es exactamente el que hay que ver, y
 * cualquier ventana de tiempo razonable lo escondería. Nació como pantalla
 * aparte («Tablero») y se fusionó aquí: dos entradas de menú llamadas
 * «Dashboard» y «Tablero» —la misma palabra en dos idiomas— obligaban a
 * adivinar cuál abrir, y peor, enseñaban cifras distintas de lo que parecía lo
 * mismo, porque una filtra por rango y la otra no.
 *
 * Las cifras las dibuja `Cifra`, la MISMA pieza que la mitad del período. Esta
 * mitad tenía las suyas propias —cajas con borde dentro de tarjetas con
 * título— y el cambio de dibujo a media pantalla hacía que la juntura entre las
 * dos mitades se leyera como el final de la página. Lo único que separa ahora
 * las dos mitades es lo que de verdad las distingue: que aquí no hay rango que
 * elegir.
 */
export function Ahora() {
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const { bodegas, aduana, excepciones, ultimaMilla } = tablero;
  const totalBultos =
    bodegas.detalle.reduce((t, b) => t + b.bultos, 0) + bodegas.sinUbicar;

  return (
    <div className="grid gap-6">
      {/* Cabecera de SECCIÓN, no de página: lo que separa esta mitad de la de
          abajo es que aquí no hay rango que elegir. Decirlo en el subtítulo
          evita que el selector de fechas de más abajo parezca que manda sobre
          estas cifras. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">Ahora</h2>
          <p className="text-sm text-muted-foreground">
            Dónde está la carga en este momento y qué necesita que alguien lo
            mire. No depende del rango de fechas.
          </p>
        </div>
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
      </div>

      {/* Lo que necesita atención va PRIMERO. Un tablero que abre con los
          totales obliga a buscar el problema entre cifras que están bien. */}
      <GrupoCifras titulo="Necesita atención">
        <Cifra
          valor={excepciones.abiertas}
          etiqueta="Excepciones abiertas"
          icono={AlertTriangle}
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
          icono={Lock}
          href="/customs"
          alerta={aduana.retenidos > 0}
          nota="No avanzan y cuestan cada día"
        />
        <Cifra
          valor={ultimaMilla.porReintentar}
          etiqueta="Por reintentar"
          icono={RotateCcw}
          href="/shipments?status=FAILED_ATTEMPT"
          alerta={ultimaMilla.porReintentar > 0}
          nota="Volvieron tras un intento fallido"
        />
        <Cifra
          valor={bodegas.sinUbicar}
          etiqueta="Bultos sin ubicar"
          icono={PackageSearch}
          href="/lockers"
          alerta={bodegas.sinUbicar > 0}
          nota="En bodega, pero sin decir en cuál"
        />
      </GrupoCifras>

      <GrupoCifras titulo="Aduana">
        <Cifra valor={aduana.pendientes} etiqueta="Pendientes" icono={Clock} />
        <Cifra
          valor={aduana.enRevision}
          etiqueta="En revisión"
          icono={FileSearch}
        />
        <Cifra
          valor={aduana.retenidos}
          etiqueta="Retenidos"
          icono={Scale}
          alerta={aduana.retenidos > 0}
        />
        <Cifra
          valor={aduana.liberados}
          etiqueta="Liberados"
          icono={BadgeCheck}
        />
      </GrupoCifras>

      <GrupoCifras titulo="Última milla">
        <Cifra
          valor={ultimaMilla.enRuta}
          etiqueta="En ruta ahora"
          icono={Truck}
          href="/routes"
        />
        <Cifra
          valor={ultimaMilla.enBodega}
          etiqueta="En bodega, sin salir"
          icono={Warehouse}
        />
        <Cifra
          valor={ultimaMilla.enTransito}
          etiqueta="En tránsito"
          icono={Route}
        />
        {/* Nulo y no 0%: sin entregas la pregunta no tiene respuesta
            todavía, y un 0% se lee como que se entregó mal. */}
        <Cifra
          valor={
            ultimaMilla.tasaPrimerIntento30Dias === null
              ? "—"
              : `${ultimaMilla.tasaPrimerIntento30Dias}%`
          }
          etiqueta="Al primer intento"
          icono={Target}
          nota={`${ultimaMilla.entregas30Dias} entrega${
            ultimaMilla.entregas30Dias === 1 ? "" : "s"
          } en 30 días`}
        />
      </GrupoCifras>

      {/* Estas dos SÍ son tarjetas: lo que llevan dentro son listas, no cifras.
          Es la línea que separa un caso del otro en toda la pantalla. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-base font-semibold text-primary">
            Dónde está la carga
          </h3>
          <div className="mt-4 grid gap-3">
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
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-base font-semibold text-primary">
            Excepciones abiertas
          </h3>
          <div className="mt-4 grid gap-3">
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
          </div>
        </div>
      </div>
    </div>
  );
}
