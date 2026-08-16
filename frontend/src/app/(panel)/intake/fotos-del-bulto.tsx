"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  LockerPackageWithLocker,
  PackagePhoto,
  PackagePhotoType,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SubirArchivo } from "@/components/subir-archivo";

/**
 * Fotos de un bulto recibido.
 *
 * Es lo que convierte «llegó dañado» en una discusión con datos. Sin foto al
 * recibir, un daño reclamado tres días después no se puede atribuir a nadie: ni
 * al transportista, ni a la bodega, ni al cliente.
 *
 * Va en un diálogo aparte y no dentro del formulario de recepción por una razón
 * concreta: para subir un archivo hay que decir a qué cuelga, y mientras se
 * teclea la recepción el bulto todavía no existe. Además el caso real no es solo
 * fotografiar al recibir — los daños se descubren al día siguiente.
 */

const TIPOS: { valor: PackagePhotoType; etiqueta: string }[] = [
  { valor: "EXTERIOR", etiqueta: "Exterior" },
  { valor: "LABEL", etiqueta: "Etiqueta" },
  { valor: "CONTENT", etiqueta: "Contenido" },
  { valor: "DAMAGE", etiqueta: "Daño" },
];

interface Props {
  paquete: LockerPackageWithLocker | null;
  onClose: () => void;
}

export function FotosDelBulto({ paquete, onClose }: Props) {
  const [tipo, setTipo] = useState<PackagePhotoType>("EXTERIOR");

  // Sin bulto no hay clave y no se pide nada: es lo que hacía el `if (paquete)`
  // del efecto, y de paso el cambio de bulto cambia la clave, así que ya no
  // hace falta vaciar la lista a mano para que no se vean las fotos del
  // anterior.
  const { datos, error, recargar } = useApi<PackagePhoto[]>(
    paquete
      ? `/lockers/${paquete.lockerId}/packages/${paquete.id}/photos`
      : null,
    { mensajeDeError: "No se pudieron cargar" },
  );

  // Si falló se enseña vacío, no un esqueleto eterno: quien viene a SUBIR una
  // foto tiene que poder hacerlo aunque la lista no haya cargado.
  const fotos = datos ?? (error ? [] : null);

  const cargar = () => void recargar();

  async function adjuntar(fileId: string) {
    if (!paquete) return;
    try {
      await api(`/lockers/${paquete.lockerId}/packages/${paquete.id}/photos`, {
        method: "POST",
        body: JSON.stringify({ fileId, type: tipo }),
      });
      toast.success("Foto adjuntada");
      cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo adjuntar",
      );
    }
  }

  return (
    <Dialog open={!!paquete} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Fotos — {paquete?.externalTracking ?? paquete?.locker.code}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tipoFoto">Tipo</Label>
            <select
              id="tipoFoto"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as PackagePhotoType)}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>

          {paquete && (
            // `key` con el número de fotos: al terminar una subida el
            // componente se reinicia solo y queda listo para la siguiente, que
            // es lo que hace falta cuando se sacan cuatro seguidas.
            <SubirArchivo
              key={`${paquete.id}-${fotos?.length ?? 0}`}
              categoria="fotos-paquete"
              propietarioId={paquete.id}
              confirmar
              etiqueta="Añadir foto"
              onSubido={(a) => {
                if (a?.fileId) void adjuntar(a.fileId);
              }}
            />
          )}

          {fotos === null ? (
            <Skeleton className="h-24 w-full" />
          ) : fotos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin fotos. Una foto al recibir es lo que permite defenderse de un
              reclamo por daño.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {fotos.map((f) => (
                <li key={f.id}>
                  {/* Enlace y no `<img>`: la URL viene firmada y dura minutos,
                      así que una galería abierta un rato se llenaría de
                      imágenes rotas. */}
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-md border p-2 text-center text-xs hover:border-primary"
                    >
                      {TIPOS.find((t) => t.valor === f.type)?.etiqueta ??
                        f.type}
                    </a>
                  ) : (
                    <span className="block rounded-md border p-2 text-center text-xs text-muted-foreground">
                      no disponible
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="button" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
