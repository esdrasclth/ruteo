"use client";

import { CheckCircle2, Image as ImageIcon, PenLine, XCircle } from "lucide-react";
import { DeliveryAttempt, MOTIVOS_DE_FALLO } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * El historial de intentos de entrega del envío (fase 5.1).
 *
 * Cuelga del ENVÍO y no de la parada porque el reintento real es una parada
 * nueva en la ruta del día siguiente: por parada se verían tres veces «intento
 * 1» en tres pantallas distintas en vez de la secuencia que le interesa a quien
 * atiende un reclamo.
 */
export function Intentos({ intentos }: { intentos: DeliveryAttempt[] }) {
  // Sin ningún intento la tarjeta no se dibuja: un envío que todavía no ha
  // salido a reparto no tiene nada que contar aquí, y una tarjeta vacía en cada
  // envío nuevo sólo alarga la pantalla.
  if (intentos.length === 0) return null;

  const fallidos = intentos.filter((i) => i.outcome === "FAILED").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Intentos de entrega</span>
          {fallidos > 0 && (
            <Badge variant="outline" className="font-normal">
              {fallidos} fallido{fallidos === 1 ? "" : "s"} de {intentos.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {intentos.map((intento) => (
          <div
            key={intento.id}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <div className="pt-0.5">
              {intento.outcome === "SUCCESS" ? (
                <CheckCircle2
                  className="size-4 text-emerald-600"
                  aria-hidden
                />
              ) : (
                <XCircle className="size-4 text-destructive" aria-hidden />
              )}
            </div>
            <div className="grid flex-1 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  Intento {intento.attemptNumber}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(intento.attemptedAt).toLocaleString("es-HN")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {intento.outcome === "SUCCESS"
                  ? intento.receivedBy
                    ? `Recibió ${intento.receivedBy}`
                    : "Entregado"
                  : intento.failureReason
                    ? MOTIVOS_DE_FALLO[intento.failureReason]
                    : "Fallido"}
              </p>
              {intento.notes && (
                <p className="text-xs text-muted-foreground">{intento.notes}</p>
              )}
              {/* Las URLs vienen firmadas y duran pocos minutos: se abren en
                  otra pestaña en vez de incrustarse, para que una pantalla
                  abierta media hora no acabe llena de imágenes rotas. */}
              <div className="flex gap-3">
                {intento.photoUrl && (
                  <a
                    href={intento.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                  >
                    <ImageIcon className="size-3" aria-hidden />
                    Ver foto
                  </a>
                )}
                {intento.signatureUrl && (
                  <a
                    href={intento.signatureUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                  >
                    <PenLine className="size-3" aria-hidden />
                    Ver firma
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
