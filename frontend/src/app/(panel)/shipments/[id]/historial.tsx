"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, ShipmentDetail, ShipmentEvent } from "@/lib/api";
import { STATUS_LABELS, statusBadgeClass } from "@/lib/shipment-status";
import { EVENT_TYPE_LABELS, eventTypeDotClass } from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * El historial del envío, que desde la fase 0.2 es más que la lista de estados.
 *
 * Las dos vistas salen de la misma tabla: el operador lo ve todo y el cliente
 * solo lo marcado como público. El interruptor de aquí enseña exactamente lo que
 * el cliente vería, que es la pregunta que se hace quien está a punto de
 * llamarle.
 */

/**
 * Las cifras del evento en una línea.
 *
 * Se eligen a mano las claves que significan algo para una persona: volcar la
 * metadata entera dejaría ids en pantalla, que no le dicen nada a nadie que esté
 * mirando un envío.
 */
function detalleDeEvento(ev: ShipmentEvent): string | null {
  const m = ev.metadata;
  if (!m) return null;
  const num = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
  const moneda = num("currency") ?? "";

  switch (ev.eventType) {
    case "CUSTOMS_ASSESSED": {
      const partes = [
        num("dutyAmount") && `arancel ${num("dutyAmount")}`,
        num("taxAmount") && `ISV ${num("taxAmount")}`,
        num("handlingFee") && `manejo ${num("handlingFee")}`,
      ].filter(Boolean);
      const fuente = m.fuente === "defecto" ? " · sin regla vigente" : "";
      return partes.length ? `${partes.join(" + ")} ${moneda}${fuente}` : null;
    }
    case "CHARGE_COLLECTED": {
      const ref = num("reference");
      return `${num("amount") ?? ""} ${moneda}${ref ? ` · ${ref}` : ""}`.trim();
    }
    case "CHARGE_ADDED":
      return `${num("amount") ?? ""} ${moneda}`.trim();
    case "CUSTOMS_CLEARED":
      return num("total") ? `total ${num("total")} ${moneda}` : null;
    default:
      return null;
  }
}

export function Historial({
  shipment,
  onCambio,
}: {
  shipment: ShipmentDetail;
  onCambio: () => void;
}) {
  const [comoCliente, setComoCliente] = useState(false);
  const [abrirNota, setAbrirNota] = useState(false);
  const [nota, setNota] = useState("");
  const [publica, setPublica] = useState(false);
  const [busy, setBusy] = useState(false);

  const eventos = comoCliente
    ? shipment.events.filter((e) => e.visibility === "PUBLIC")
    : shipment.events;
  const ocultos = shipment.events.length - eventos.length;

  async function guardarNota(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/shipments/${shipment.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ description: nota.trim(), publica }),
      });
      toast.success("Nota añadida");
      setAbrirNota(false);
      setNota("");
      setPublica(false);
      onCambio();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo añadir la nota",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Historial</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={comoCliente ? "default" : "outline"}
              onClick={() => setComoCliente((v) => !v)}
            >
              {comoCliente ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
              Ver como el cliente
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAbrirNota(true)}
            >
              Añadir nota
            </Button>
          </div>
        </div>
        {comoCliente ? (
          // Dice «qué eventos» y no «cómo se ven»: el rastreo público los pinta
          // con menos detalle que esta pantalla. Prometer que es idéntico
          // llevaría a dar por revisado algo que no se revisó.
          <p className="text-xs text-muted-foreground">
            Solo los eventos que el cliente ve en su rastreo
            {ocultos > 0
              ? `. Se ocultan ${ocultos} interno(s).`
              : "."}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            El cliente todavía no vería nada de este envío.
          </p>
        ) : (
          <ol className="relative ml-3 border-l border-border">
            {[...eventos].reverse().map((ev) => (
              <li key={ev.id} className="mb-5 ml-5">
                <span
                  className={`absolute -left-[5px] mt-1.5 size-2.5 rounded-full ${eventTypeDotClass(ev.eventType)}`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {/* El estado solo lo llevan los cambios de estado; el resto se
                      identifica por su tipo. */}
                  {ev.status ? (
                    <Badge className={statusBadgeClass(ev.status)}>
                      {STATUS_LABELS[ev.status]}
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      {EVENT_TYPE_LABELS[ev.eventType]}
                    </Badge>
                  )}
                  {/* Solo se marca lo interno: en la vista del operador, que es
                      la de casi siempre, casi todo sería «público» y una
                      etiqueta que aparece en cada línea no informa de nada. */}
                  {!comoCliente && ev.visibility === "INTERNAL" ? (
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      interno
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {new Date(ev.occurredAt).toLocaleString("es-HN")}
                  </span>
                </div>
                {ev.description ? (
                  <p className="mt-1 text-sm">{ev.description}</p>
                ) : null}
                {detalleDeEvento(ev) ? (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {detalleDeEvento(ev)}
                  </p>
                ) : null}
                {ev.locationLabel ? (
                  <p className="text-xs text-muted-foreground">
                    {ev.locationLabel}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <Dialog open={abrirNota} onOpenChange={setAbrirNota}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir nota</DialogTitle>
          </DialogHeader>
          <form onSubmit={guardarNota} className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Para lo que pasa de verdad y no encaja en ningún hito. Queda con
              fecha y con autor, que es más de lo que ofrece un WhatsApp.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="nota">Nota</Label>
              <Textarea
                id="nota"
                rows={3}
                required
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={publica}
                onChange={(e) => setPublica(e.target.checked)}
              />
              <span>
                Que el cliente la vea en su rastreo
                <span className="block text-xs text-muted-foreground">
                  Una vez publicada no se puede deshacer: el cliente ya la leyó.
                </span>
              </span>
            </label>
            <DialogFooter>
              <Button type="submit" disabled={busy || nota.trim() === ""}>
                {busy ? "Guardando…" : "Añadir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
