import { MapPin, Plane } from "lucide-react";
import { cn } from "@/lib/utils";

// Maqueta de la vista pública de rastreo para el hero. Es la pantalla que ve el
// destinatario, no el panel: en esta página lo que se vende es que el cliente
// deje de llamar para preguntar, así que lo que flota sobre la foto es SU
// pantalla. Los datos son de ejemplo y los hitos son los estados reales del
// flujo internacional (ver src/lib/shipment-status.ts).

type Estado = "hecho" | "actual" | "pendiente";

const HITOS: { label: string; fecha: string; estado: Estado }[] = [
  {
    label: "Recibido en bodega de origen",
    fecha: "28 jul · 09:14",
    estado: "hecho",
  },
  { label: "Consolidado", fecha: "29 jul · 16:02", estado: "hecho" },
  { label: "Tránsito internacional", fecha: "31 jul · 04:30", estado: "hecho" },
  { label: "En aduana HN", fecha: "2 ago · 11:20", estado: "actual" },
  { label: "En bodega HN", fecha: "estimado 6 ago", estado: "pendiente" },
  { label: "En reparto", fecha: "estimado 7 ago", estado: "pendiente" },
];

export function TrackingPreview() {
  return (
    <div className="relative">
      <div className="glass-float rounded-3xl p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Guía
            </p>
            <p className="mt-1 font-mono text-[15px] tracking-wide text-primary">
              RUT-8K3P2M4Q7B
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground">
            En aduana HN
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">Miami, FL</span>
          <span className="h-px w-4 shrink-0 bg-primary/25" />
          <Plane className="size-3.5 shrink-0" />
          <span className="h-px w-4 shrink-0 bg-primary/25" />
          <span className="truncate">Tegucigalpa, HN</span>
        </div>

        <div className="my-5 h-px bg-primary/8" />

        <ol className="flex flex-col">
          {HITOS.map((h, i) => (
            <li key={h.label} className="flex gap-3.5">
              {/* Carril del hito: el punto y la línea que baja al siguiente. El
                  último no dibuja línea para que la lista no quede colgando. */}
              <div className="flex flex-col items-center pt-1">
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    h.estado === "hecho" && "bg-primary/45",
                    h.estado === "actual" &&
                      "bg-primary ring-4 ring-primary/15",
                    h.estado === "pendiente" &&
                      "border border-primary/25 bg-white",
                  )}
                />
                {i < HITOS.length - 1 ? (
                  <span
                    className={cn(
                      "w-px flex-1",
                      h.estado === "hecho" ? "bg-primary/25" : "bg-primary/10",
                    )}
                  />
                ) : null}
              </div>

              {/* En móvil la fecha baja debajo del hito. En una línea, el
                  rótulo se recortaba —«Recibido en bodega de or…»— y el hito es
                  justo lo que se viene a leer. */}
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3",
                  i < HITOS.length - 1 && "pb-3.5 sm:pb-4",
                )}
              >
                <span
                  className={cn(
                    "text-sm sm:truncate",
                    h.estado === "actual"
                      ? "font-medium text-primary"
                      : h.estado === "pendiente"
                        ? "text-muted-foreground/70"
                        : "text-foreground/80",
                  )}
                >
                  {h.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px] tabular-nums",
                    h.estado === "pendiente"
                      ? "text-muted-foreground/60"
                      : "text-muted-foreground",
                  )}
                >
                  {h.fecha}
                </span>
              </div>
            </li>
          ))}
        </ol>

        {/* En móvil las dos columnas no caben sin partir los rótulos por la
            mitad («Entrega / estimada»), así que se apilan y el cargo de aduana
            pasa a una fila con separador. */}
        <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-[#eaf2f0] px-4 py-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-primary/70">
              Entrega estimada
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-primary">
              7 de agosto
            </p>
          </div>
          <p className="flex items-baseline justify-between gap-3 border-t border-primary/10 pt-2.5 text-xs leading-relaxed text-muted-foreground sm:block sm:border-0 sm:pt-0 sm:text-right">
            Impuestos de aduana
            <span className="font-mono text-[13px] text-foreground sm:mt-0 sm:block">
              L 1,240.00
            </span>
          </p>
        </div>
      </div>

      {/* Tarjeta pequeña desplazada: el solape es lo que da la sensación de
          capas de vidrio de la referencia. Se oculta en móvil, donde solo
          estorbaría al borde de la tarjeta principal. */}
      <div className="glass-card absolute -bottom-9 -left-12 hidden rounded-2xl px-4 py-3 lg:block">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Aviso enviado
        </p>
        <p className="mt-1 text-sm text-foreground/85">
          María R. · SMS y correo
        </p>
      </div>
    </div>
  );
}
