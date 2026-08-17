"use client";

import Link from "next/link";
import { PackageSearch, RefreshCw } from "lucide-react";
import { TableroOperacion } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { EXCEPTION_SEVERITY_LABELS, severityBadgeClass } from "@/lib/fase2";
import { Atencion, Pendiente } from "@/components/atencion";
import { Recorrido } from "@/components/recorrido";
import { MedidorApilado, Tramo } from "@/components/medidor";
import { Numero } from "@/components/numero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * La mitad «ahora» de la pantalla de inicio (§6 del plan): dónde está la carga
 * en este momento y qué necesita que alguien lo mire.
 *
 * **No tiene selector de fechas, y por eso vive separada de la mitad de abajo.**
 * Un bulto parado en aduana desde marzo es exactamente el que hay que ver, y
 * cualquier ventana de tiempo razonable lo escondería.
 *
 * ## Por qué ya no son doce cifras
 *
 * Esta mitad llegó a tener doce cifras en tres grupos de cuatro, todas del mismo
 * tamaño y con el mismo peso. Tres problemas encadenados:
 *
 * 1. **Nada destacaba.** «2 sin asignar a nadie» se dibujaba igual que «31
 *    liberados de aduana», así que había que leerlas todas para encontrar la que
 *    importaba.
 * 2. **Los retenidos en aduana salían dos veces**, con el mismo número, en dos
 *    grupos distintos. Dos cifras iguales en una pantalla hacen dudar de ambas.
 * 3. **Seis de las doce no llevaban a ningún sitio.** Una cifra que señala un
 *    problema y no lleva a él obliga a buscarlo a mano.
 *
 * Ahora hay una franja de atención que **sólo dibuja lo que está mal**, y los
 * dos desgloses —aduana y última milla— son recorridos de una línea, porque eso
 * es lo que son: fases de un trayecto, no cosas que comparar entre sí.
 */
export function Ahora() {
  const {
    datos: tablero,
    cargando,
    refrescando,
    recargar: load,
  } = useApi<TableroOperacion>("/analytics/operacion", {
    mensajeDeError: "No se pudo cargar el tablero",
  });

  if (cargando || !tablero) {
    return (
      <div className="grid gap-4">
        {/* Los esqueletos imitan la forma de lo que viene —una franja fina y
            dos bloques— y no tres cajas iguales: así el salto al llegar los
            datos es de contenido y no de maquetación. */}
        <Skeleton className="esqueleto-brillo h-20 rounded-2xl" />
        <Skeleton className="esqueleto-brillo h-24 rounded-2xl" />
        <Skeleton className="esqueleto-brillo h-24 rounded-2xl" />
      </div>
    );
  }

  const { bodegas, aduana, excepciones, ultimaMilla } = tablero;
  const totalBultos =
    bodegas.detalle.reduce((t, b) => t + b.bultos, 0) + bodegas.sinUbicar;

  // El reparto entre bodegas, en una sola barra. Los números de al lado dicen
  // CUÁNTO hay en cada una; la barra dice qué parte del total es cada una, que
  // con tres o cuatro bodegas es una división mental que nadie hace al vuelo.
  // Los sin ubicar entran como un tramo más, en rojo y al final: son parte del
  // total —si no, la barra no cuadraría con la cifra de la derecha— pero no son
  // un sitio donde esté la carga, que es lo que la barra dibuja.
  const tramosBodega: Tramo[] = [
    ...bodegas.detalle.map((b) => ({
      clave: b.warehouseId ?? "sin-id",
      valor: b.bultos,
      etiqueta: b.name ?? "Bodega",
    })),
    {
      clave: "sin-ubicar",
      valor: bodegas.sinUbicar,
      etiqueta: "Sin bodega asignada",
      alerta: true,
    },
  ];

  // Lo urgente, en el orden en que cuesta dinero: una excepción sin dueño no
  // avanza nunca; un bulto retenido en aduana genera almacenaje cada día; un
  // reintento pendiente es una entrega que ya falló una vez.
  const pendientes: Pendiente[] = [
    {
      cuantos: excepciones.abiertas,
      uno: "excepción abierta",
      varios: "excepciones abiertas",
      href: "/exceptions",
    },
    {
      cuantos: aduana.retenidos,
      uno: "retenido en aduana",
      varios: "retenidos en aduana",
      href: "/customs",
    },
    {
      cuantos: ultimaMilla.porReintentar,
      uno: "envío por reintentar",
      varios: "envíos por reintentar",
      href: "/shipments?status=FAILED_ATTEMPT",
    },
    {
      cuantos: bodegas.sinUbicar,
      uno: "bulto sin ubicar",
      varios: "bultos sin ubicar",
      href: "/lockers",
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">Ahora</h2>
          <p className="text-sm text-muted-foreground">
            Dónde está la carga en este momento. No depende del rango de fechas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* La hora importa: es una foto, y quien la mira tiene que saber de
              cuándo es antes de tomar una decisión con ella. */}
          <span className="text-xs text-muted-foreground">
            {new Date(tablero.generadoEn).toLocaleTimeString("es-HN")}
          </span>
          {/* Envuelto y no `onClick={load}` a secas: `recargar` acepta un dato
              como primer argumento para escribir la caché a mano, y pasarle el
              manejador directo le colaría el evento del ratón como si fuera el
              tablero. */}
          {/* El icono gira mientras se pide de verdad. Sin esto, pulsar
              «Actualizar» sobre un tablero que apenas cambia no daba ninguna
              señal de que hubiera pasado algo, y se pulsaba tres veces. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={refrescando}
          >
            <RefreshCw
              className={cn("size-4", refrescando && "animate-spin")}
              aria-hidden
            />
            Actualizar
          </Button>
        </div>
      </div>

      <Atencion
        className="aparece"
        pendientes={pendientes}
        // El desglose por severidad vive DENTRO de la franja y ya no en una
        // tarjeta aparte: es la letra pequeña de «3 excepciones abiertas», y
        // separarlo obligaba a cruzar dos bloques para entender un solo dato.
        detalle={
          excepciones.abiertas > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {excepciones.sinAsignar > 0 && (
                <span className="text-xs font-medium text-destructive">
                  {excepciones.sinAsignar} sin asignar a nadie
                </span>
              )}
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
          ) : undefined
        }
      />

      {/* Los tres en UNA fila y no apilados. Apilados, cada bloque ocupaba los
          1200px de ancho para poner tres números en los primeros 300: el 70%
          de cada caja era aire, y tres cajas grandes y vacías una encima de
          otra se leen como «un montón de tarjetas» aunque sean sólo tres.
          Repartidos en columnas, la misma información ocupa un tercio del alto
          y llena el ancho que ya estaba pagado. */}
      <div className="grid gap-4 lg:grid-cols-3">
      {/* Dónde está la carga: una línea de bodegas, no una tarjeta con una fila
          bordeada por bodega. Con tres bodegas aquello ocupaba media pantalla
          para decir tres números. */}
      <section
        className="glass-card aparece rounded-2xl p-5"
        style={{ "--retraso": "60ms" } as React.CSSProperties}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-sm font-semibold text-foreground/75">
            Dónde está la carga
          </h3>
          <span className="text-xs text-muted-foreground">
            <Numero valor={totalBultos} className="tabular-nums" /> bulto
            {totalBultos === 1 ? "" : "s"} en total
          </span>
        </div>

        {bodegas.detalle.length === 0 && bodegas.sinUbicar === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No hay bultos en bodega ahora mismo.
          </p>
        ) : (
          <>
          <MedidorApilado tramos={tramosBodega} retraso={120} className="mt-4" />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
            {bodegas.detalle.map((b) => (
              <div key={b.warehouseId} className="flex flex-col">
                <Numero
                  valor={b.bultos}
                  className="text-2xl font-semibold tabular-nums text-primary"
                />
                <span className="text-xs leading-tight text-muted-foreground">
                  {b.name ?? "Bodega"}
                  {b.code ? ` · ${b.code}` : ""}
                </span>
              </div>
            ))}
            {/* Se enseña aunque el resto tenga carga: si desapareciera, el
                tablero mostraría bodegas vacías y parecería que no hay nada,
                cuando lo que pasa es que nadie ubicó los bultos. */}
            {bodegas.sinUbicar > 0 && (
              <Link
                href="/lockers"
                className="group flex flex-col rounded-lg px-2 py-1 transition-colors hover:bg-destructive/10"
              >
                <span className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-destructive">
                  <Numero valor={bodegas.sinUbicar} />
                  <PackageSearch className="size-4" aria-hidden />
                </span>
                <span className="text-xs leading-tight text-muted-foreground">
                  Sin bodega asignada
                </span>
              </Link>
            )}
          </div>
          </>
        )}
      </section>

      <Recorrido
        titulo="Aduana"
        vacio="Nada en trámite aduanero."
        retraso={120}
        pasos={[
          { etiqueta: "Pendientes", valor: aduana.pendientes, href: "/customs" },
          {
            etiqueta: "En revisión",
            valor: aduana.enRevision,
            href: "/customs",
          },
          {
            etiqueta: "Retenidos",
            valor: aduana.retenidos,
            href: "/customs",
            alerta: aduana.retenidos > 0,
          },
          { etiqueta: "Liberados", valor: aduana.liberados, href: "/customs" },
        ]}
      />

      <Recorrido
        titulo="Última milla"
        vacio="Nada en reparto ahora mismo."
        retraso={180}
        pasos={[
          {
            etiqueta: "En bodega",
            valor: ultimaMilla.enBodega,
            href: "/shipments?status=IN_WAREHOUSE_HN",
          },
          {
            etiqueta: "En tránsito",
            valor: ultimaMilla.enTransito,
            href: "/shipments?status=IN_TRANSIT",
          },
          { etiqueta: "En ruta", valor: ultimaMilla.enRuta, href: "/routes" },
        ]}
        extra={
          <span className="text-xs text-muted-foreground">
            {/* Nulo y no 0%: sin entregas la pregunta no tiene respuesta
                todavía, y un 0% se lee como que se entregó mal. */}
            {ultimaMilla.tasaPrimerIntento30Dias === null
              ? "sin entregas aún"
              : `${ultimaMilla.tasaPrimerIntento30Dias}% al primer intento`}
          </span>
        }
      />
      </div>
    </div>
  );
}
