"use client";

import { useState } from "react";
import { BadgeCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, DocumentType, ShipmentDocument } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SubirArchivo } from "@/components/subir-archivo";

/**
 * Expediente documental del envío.
 *
 * Los documentos van aquí y no en la tarjeta de aduana porque no todos son
 * aduaneros —la guía aérea y la identificación no lo son— y porque el expediente
 * se arma antes de que haya expediente aduanero que rellenar.
 *
 * Verificar es un acto aparte de subir: separa «alguien subió un PDF» de
 * «alguien lo miró y dice que sirve», que es la diferencia entre tener un
 * documento y tener el trámite cubierto.
 */

const TIPOS: { valor: DocumentType; etiqueta: string }[] = [
  { valor: "COMMERCIAL_INVOICE", etiqueta: "Factura comercial" },
  { valor: "AIR_WAYBILL", etiqueta: "Guía aérea" },
  { valor: "CUSTOMS_DECLARATION", etiqueta: "Declaración aduanera" },
  { valor: "PERMIT", etiqueta: "Permiso" },
  { valor: "IDENTIFICATION", etiqueta: "Identificación" },
  { valor: "OTHER", etiqueta: "Otro" },
];

function etiquetaTipo(t: DocumentType) {
  return TIPOS.find((x) => x.valor === t)?.etiqueta ?? t;
}

export function Expediente({ shipmentId }: { shipmentId: string }) {
  const [tipo, setTipo] = useState<DocumentType>("COMMERCIAL_INVOICE");
  const [busy, setBusy] = useState(false);

  const {
    datos,
    error,
    recargar: cargar,
  } = useApi<ShipmentDocument[]>(`/customs/${shipmentId}/documents`, {
    mensajeDeError: "Error cargando documentos",
  });

  // Si falló, se enseña el expediente vacío y no un esqueleto eterno: el aviso
  // ya dijo lo que pasó, y quien viene a SUBIR un documento tiene que poder
  // hacerlo aunque la lista no haya cargado.
  const docs = datos ?? (error ? [] : null);

  async function adjuntar(fileId: string) {
    setBusy(true);
    try {
      await api(`/customs/${shipmentId}/documents`, {
        method: "POST",
        body: JSON.stringify({ fileId, type: tipo }),
      });
      toast.success("Documento adjuntado");
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo adjuntar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verificar(doc: ShipmentDocument) {
    setBusy(true);
    try {
      await api(`/customs/documents/${doc.id}/verify`, { method: "PATCH" });
      toast.success("Documento verificado");
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo verificar",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Expediente documental</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="tipoDoc">Tipo</Label>
          <select
            id="tipoDoc"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as DocumentType)}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {/* `key` con el número de documentos: al terminar una subida el
            componente se reinicia y queda listo para la siguiente. */}
        <SubirArchivo
          key={`${shipmentId}-${docs?.length ?? 0}`}
          categoria="documentos"
          propietarioId={shipmentId}
          confirmar
          modo="archivo"
          accept="image/*,application/pdf"
          etiqueta="Adjuntar documento"
          onSubido={(a) => {
            if (a?.fileId) void adjuntar(a.fileId);
          }}
        />

        {docs === null ? (
          <Skeleton className="h-20 w-full" />
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin documentos. Si la regla de aduana exige factura comercial, el
            envío no se podrá liberar hasta que esté aquí.
          </p>
        ) : (
          <ul className="grid gap-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
              >
                <FileText
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="font-medium">{etiquetaTipo(d.type)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {d.originalName ?? ""}
                </span>
                {d.verifiedAt ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    <BadgeCheck className="mr-1 size-3" aria-hidden />
                    Verificado
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => verificar(d)}
                  >
                    Verificar
                  </Button>
                )}
                {/* Enlace y no visor incrustado: la URL viene firmada y dura
                    minutos, así que una pantalla abierta un rato se llenaría de
                    enlaces rotos. */}
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Abrir
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    no disponible
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
