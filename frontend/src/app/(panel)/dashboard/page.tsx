"use client";

import { Suspense } from "react";
import Link from "next/link";
import { DashboardAnalytics } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  paymentStatusBadgeClass,
} from "@/lib/logistics";
import { TYPE_LABELS } from "@/lib/shipment-status";
import { Ahora } from "./ahora";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { DailyChart } from "@/components/daily-chart";
import { Medidor } from "@/components/medidor";
import { comoDinero, Numero } from "@/components/numero";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { opcionDesdeUrl, useUrlFilters } from "@/lib/use-url-filters";

const DIAS_PERMITIDOS = ["7", "30", "90"] as const;

const RANGOS = [
  { dias: 7, label: "Últimos 7 días" },
  { dias: 30, label: "Últimos 30 días" },
  { dias: 90, label: "Últimos 90 días" },
];

/**
 * Cifra del período: número, etiqueta, nota y un medidor de un píxel de alto.
 *
 * Es deliberadamente MÁS DÉBIL que la franja de atención de arriba. La versión
 * anterior usaba la misma tarjeta de vidrio que el resto de la pantalla, y el
 * efecto era que «128 envíos en 30 días» —un dato que se consulta— pesaba lo
 * mismo que «2 excepciones sin asignar», que es trabajo sin hacer. La jerarquía
 * de esta pantalla es esa y no otra: primero lo que hay que atender, después lo
 * que hay que saber.
 *
 * **El medidor no rompe esa regla, y por eso mide 1px y no 6.** Las cuatro
 * cifras son todas partes de un total —entregados de los envíos, cobrado de lo
 * que se debía— y esa proporción no estaba dibujada en ningún sitio: había que
 * dividir dos números de memoria. Una barra fina la enseña sin añadir ni una
 * caja ni un color saturado, que es lo que volvería a subir esta fila al peso
 * de la franja de arriba.
 */
function CifraPeriodo({
  etiqueta,
  valor,
  formato,
  nota,
  href,
  proporcion,
  retraso = 0,
}: {
  etiqueta: string;
  valor: number;
  formato?: (n: number) => string;
  nota?: string;
  href: string;
  /** De 0 a 1: qué parte del total representa la cifra. */
  proporcion?: number;
  retraso?: number;
}) {
  return (
    <Link
      href={href}
      className="group -mx-2 flex flex-col rounded-lg px-2 py-1 transition-colors hover:bg-primary/5"
    >
      <Numero
        valor={valor}
        formato={formato}
        className="text-2xl font-semibold tabular-nums text-primary"
      />
      <span className="text-xs leading-tight text-foreground/70">
        {etiqueta}
      </span>
      {nota ? (
        <span className="text-xs leading-tight text-muted-foreground">
          {nota}
        </span>
      ) : null}
      {proporcion === undefined ? null : (
        <Medidor proporcion={proporcion} retraso={retraso} className="mt-2" />
      )}
    </Link>
  );
}

/**
 * Qué parte de `parte` es del total que forma con `resto`.
 *
 * Devuelve `undefined` y no 0 cuando no hay nada: sin envíos en el rango, la
 * pregunta «qué porcentaje se entregó» no tiene respuesta, y una barra vacía la
 * respondería con «ninguno». Quien la recibe se salta el medidor entero.
 */
function reparto(parte: number, resto: number): number | undefined {
  const total = parte + resto;
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return parte / total;
}

/** Fila de una lista de desglose: etiqueta, cifra y barra contra el mayor. */
function FilaDesglose({
  children,
  proporcion,
  retraso,
}: {
  children: React.ReactNode;
  proporcion: number;
  retraso: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      {children}
      <Medidor proporcion={proporcion} retraso={retraso} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { searchParams, actualizar } = useUrlFilters();
  const dias = opcionDesdeUrl(searchParams, "days", DIAS_PERMITIDOS, "30");

  // **El inicio se trunca a la hora en punto, y no es un detalle.**
  //
  // La consulta ES la clave de caché, y `new Date()` a milisegundos daría una
  // clave distinta en cada render: cuatro peticiones nuevas por cada repintado,
  // en bucle. Truncando, la clave es la misma durante toda la hora, así que
  // volver al inicio pinta al instante y refresca por detrás.
  //
  // Sobre un rango de treinta días, mover el corte hasta sesenta minutos no
  // cambia ninguna cifra que alguien vaya a mirar.
  const desde = new Date();
  desde.setDate(desde.getDate() - Number(dias));
  desde.setMinutes(0, 0, 0);
  const qs = `?from=${desde.toISOString()}`;

  const mensajeDeError = "Error cargando analítica";
  // `keepPreviousData` es lo que antes hacía «no limpiar el estado»: al cambiar
  // de rango se mantiene el render anterior atenuado en vez de volver al
  // esqueleto y hacer saltar el layout entero.
  const opciones = { mensajeDeError, keepPreviousData: true };

  const tablero = useApi<DashboardAnalytics>(
    `/analytics/dashboard${qs}`,
    opciones,
  );
  const overview = tablero.datos?.overview ?? null;
  const shipments = tablero.datos?.shipments ?? null;
  const payments = tablero.datos?.payments ?? null;
  const drivers = tablero.datos?.drivers ?? null;

  // Atenuar mientras se refresca por detrás, que es justo lo que `refrescando`
  // significa: hay datos en pantalla y viene una versión nueva.
  const recargando = tablero.refrescando;

  // El skeleton cubre SOLO la mitad del período. Antes cortaba la pantalla
  // entera, y ahora eso escondería la mitad «Ahora» —que ya tiene sus datos y
  // es la que se atiende— mientras se descarga una gráfica que nadie está
  // esperando.
  const periodoListo = overview && shipments && payments && drivers;

  const maxDaily = periodoListo
    ? Math.max(0, ...shipments.daily.map((d) => d.count))
    : 0;
  const totalRango = periodoListo
    ? shipments.daily.reduce((acc, d) => acc + d.count, 0)
    : 0;

  // Cada lista del desglose mide sus barras contra SU propia fila mayor, no
  // contra un tope común. Son tres magnitudes distintas —envíos, lempiras
  // cobrados, lempiras por repartidor— y compartir escala haría que la lista de
  // envíos apareciera como cuatro rayas invisibles al lado de un cobro de miles.
  // Lo que se compara aquí es dentro de cada lista, nunca entre listas.
  //
  // El `1` del suelo evita dividir por cero cuando la lista tiene filas pero
  // todas valen 0; la lista vacía ni siquiera llega a pintar barras.
  const topeTipo = periodoListo
    ? Math.max(1, ...shipments.byType.map((r) => r.count))
    : 1;
  const topePago = periodoListo
    ? Math.max(1, ...payments.breakdown.map((r) => Number(r.amount)))
    : 1;
  const repartidoresOrdenados = periodoListo
    ? [...drivers.drivers].sort(
        (a, b) => Number(b.codAmount) - Number(a.codAmount),
      )
    : [];
  const topeRepartidor = Math.max(
    1,
    ...repartidoresOrdenados.map((r) => Number(r.codAmount)),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inicio"
        description="Lo que está pasando ahora y cómo ha ido el período."
      />

      {/* La mitad de arriba: la foto del ahora. Va PRIMERO porque es sobre lo
          que se actúa hoy; el histórico se consulta, no se atiende. */}
      <Ahora />

      {/* Regla que nace y muere en transparente, no un borde de lado a lado: la
          línea dura cerraba la página en vez de separar dos secciones de la
          misma. Ahora que las dos mitades dibujan sus cifras igual, con esto y
          el aire de alrededor basta para marcar el cambio. */}
      <div className="mt-6 rule-fade" aria-hidden />

      {/* Cabecera de la segunda mitad. El selector de rango vive AQUÍ y no en
          la cabecera de la página: mandando sobre toda la pantalla parecería
          filtrar también las cifras de arriba, que no dependen de fechas, y esa
          confusión —dos bloques de números que parecen lo mismo y no cuadran—
          es justo la que se cargó la separación anterior en dos pantallas. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">En el período</h2>
          <p className="text-sm text-muted-foreground">
            Volumen, cobros y notificaciones del rango elegido.
          </p>
        </div>
        <Select
          value={dias}
          onValueChange={(valor) =>
            actualizar({ days: valor === "30" ? null : valor }, "push")
          }
        >
          <SelectTrigger className="w-48" aria-label="Rango de fechas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGOS.map((r) => (
              <SelectItem key={r.dias} value={String(r.dias)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!periodoListo ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="esqueleto-brillo h-72 rounded-2xl" />
          <Skeleton className="esqueleto-brillo h-40 rounded-2xl" />
        </div>
      ) : (
        // El atenuado al cambiar de rango envuelve SOLO esta mitad: la de arriba
        // no se recarga, así que oscurecerla sugeriría que también está cambiando.
        <div
          className={cn(
            "flex flex-col gap-4 transition-opacity duration-200",
            recargando && "opacity-60",
          )}
        >
          {/* Las cuatro cifras del período iban en cuatro tarjetas de vidrio del
            mismo tamaño que las de arriba. Aquí van como una fila de texto
            dentro del bloque de la gráfica, y no por ahorrar espacio: la
            franja de atención tiene que ser lo más fuerte de la pantalla, y
            cuatro tarjetas grandes compitiendo con ella la apagaban. Estas
            cifras se consultan, no se atienden. */}
          <section
            className="glass-panel aparece rounded-2xl p-5 sm:p-6"
            style={{ "--retraso": "40ms" } as React.CSSProperties}
          >
            {/* Rejilla y no una fila pegada a la izquierda: en un panel de 1200px
              cuatro cifras amontonadas en el primer cuarto dejan el resto en
              blanco, y el bloque parece grande sin serlo. */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {/* Sin medidor, y es deliberado: la única proporción que se podría
                dibujar aquí —entregados sobre el total— ES la tasa de entrega
                de la casilla de al lado. Dos barras idénticas, una junto a
                otra, diciendo el mismo 53%. Es el mismo error que ya se corrigió
                en la mitad de arriba cuando los retenidos en aduana salían dos
                veces: dos cifras iguales en una pantalla hacen dudar de las
                dos. Un total no es parte de nada, así que no lleva barra. */}
              <CifraPeriodo
                etiqueta="Envíos"
                valor={overview.shipments.total}
                nota={`${overview.shipments.delivered} entregados`}
                href="/shipments"
              />
              <CifraPeriodo
                etiqueta="Tasa de entrega"
                valor={overview.shipments.deliveryRate * 100}
                formato={(n) => `${n.toFixed(1)}%`}
                nota={`${overview.shipments.failed} fallidos`}
                // La tasa YA es una proporción: aquí el medidor no divide nada,
                // sólo dibuja el mismo número que hay encima.
                proporcion={overview.shipments.deliveryRate}
                href="/shipments?status=DELIVERED"
                retraso={60}
              />
              <CifraPeriodo
                etiqueta="COD cobrado"
                valor={Number(overview.cod.collected)}
                formato={comoDinero}
                // Con el mismo formato que la cifra de arriba. Animar el cobrado
                // obliga a pasarlo por número y a escribirlo con dos decimales;
                // dejar el pendiente en crudo ponía «17352.00» encima de «38765»,
                // y dos importes con distinta pinta se leen como dos magnitudes
                // distintas.
                nota={`${comoDinero(Number(overview.cod.pending))} pendiente`}
                proporcion={reparto(
                  Number(overview.cod.collected),
                  Number(overview.cod.pending),
                )}
                href="/payments"
                retraso={120}
              />
              <CifraPeriodo
                etiqueta="Notificaciones"
                valor={overview.notifications.sent}
                nota={
                  overview.notifications.failed > 0
                    ? `${overview.notifications.failed} fallidas`
                    : undefined
                }
                proporcion={reparto(
                  overview.notifications.sent,
                  overview.notifications.failed,
                )}
                href="/notifications"
                retraso={180}
              />
            </div>

            <div className="mt-6 border-t pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-semibold text-foreground/75">
                  Envíos por día
                </h3>
                <p className="text-xs text-muted-foreground">
                  {totalRango} en el período · máximo {maxDaily} en un día
                </p>
              </div>
              <div className="mt-4">
                {shipments.daily.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin envíos en el rango.
                  </p>
                ) : (
                  <DailyChart data={shipments.daily} label="envíos" />
                )}
              </div>
            </div>
          </section>

          {/* Los tres desgloses eran tres tarjetas de vidrio sueltas. El dato no
            sobra —nadie más lo da— pero cada uno son dos o tres líneas, y tres
            tarjetas para eso es envoltorio con más peso que el contenido. En
            tres columnas de un mismo bloque se leen igual y pesan una tercera
            parte. */}
          <section
            className="glass-card aparece rounded-2xl p-5 sm:p-6"
            style={{ "--retraso": "120ms" } as React.CSSProperties}
          >
            <h3 className="text-sm font-semibold text-foreground/75">
              Desglose del período
            </h3>
            <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Por tipo
                </p>
                <div className="mt-2 flex flex-col gap-2.5">
                  {shipments.byType.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos.</p>
                  ) : (
                    shipments.byType.map((row, i) => (
                      <FilaDesglose
                        key={row.type}
                        proporcion={row.count / topeTipo}
                        retraso={i * 50}
                      >
                        <Link
                          href={`/shipments?type=${row.type}`}
                          className="-mx-2 flex items-center justify-between rounded-lg px-2 py-0.5 text-sm transition-colors hover:bg-primary/5"
                        >
                          <span className="text-foreground/80">
                            {TYPE_LABELS[row.type] ?? row.type}
                          </span>
                          <Numero
                            valor={row.count}
                            className="font-semibold tabular-nums text-primary"
                          />
                        </Link>
                      </FilaDesglose>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pagos
                </p>
                <div className="mt-2 flex flex-col gap-2.5">
                  {payments.breakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin pagos en el rango.
                    </p>
                  ) : (
                    payments.breakdown.map((row, i) => (
                      <FilaDesglose
                        key={`${row.type}-${row.status}`}
                        proporcion={Number(row.amount) / topePago}
                        retraso={i * 50}
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-foreground/80">
                              {PAYMENT_TYPE_LABELS[row.type]}
                            </span>
                            <Badge
                              className={cn(
                                "shrink-0 px-1.5 py-0 text-[10px]",
                                paymentStatusBadgeClass(row.status),
                              )}
                            >
                              {PAYMENT_STATUS_LABELS[row.status]}
                            </Badge>
                          </span>
                          <Numero
                            valor={Number(row.amount)}
                            formato={comoDinero}
                            className="shrink-0 font-semibold tabular-nums text-primary"
                          />
                        </div>
                      </FilaDesglose>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  COD por repartidor
                </p>
                <div className="mt-2 flex flex-col gap-2.5">
                  {drivers.drivers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nadie registró cobros. El COD que se cobra solo al marcar
                      entregado no queda asignado a un repartidor.
                    </p>
                  ) : (
                    repartidoresOrdenados.map((row, i) => (
                      <FilaDesglose
                        key={row.driverId ?? "sin-driver"}
                        proporcion={Number(row.codAmount) / topeRepartidor}
                        retraso={i * 50}
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-foreground/80">
                            {row.name ?? "Sin nombre"}
                          </span>
                          <Numero
                            valor={Number(row.codAmount)}
                            formato={comoDinero}
                            className="shrink-0 font-semibold tabular-nums text-primary"
                          />
                        </div>
                      </FilaDesglose>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
