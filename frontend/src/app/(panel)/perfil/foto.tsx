"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, CurrentUser } from "@/lib/api";
import { Avatar } from "@/components/avatar";
import { avisarPerfilCambiado } from "@/lib/eventos";
import { Button } from "@/components/ui/button";

/** 5 MB, el mismo tope que valida el backend. Ver `avatar.dto.ts`. */
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

/**
 * Igual que en `SubirArchivo`: el motivo real del fallo viene en un XML de S3 y
 * sin sacarlo queda un «respondió 403» que no distingue firma de permisos.
 */
async function razonDeS3(res: Response): Promise<string> {
  try {
    const cuerpo = await res.text();
    const codigo = /<Code>([^<]+)<\/Code>/.exec(cuerpo)?.[1];
    const mensaje = /<Message>([^<]+)<\/Message>/.exec(cuerpo)?.[1];
    if (codigo) return mensaje ? `${codigo}: ${mensaje}` : codigo;
    return cuerpo.slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * La foto de perfil.
 *
 * Tres pasos, como el resto de subidas del sistema: se pide permiso, el
 * navegador sube DIRECTO al almacenamiento —el archivo no pasa por el
 * backend— y después se apunta. El `fetch` de la subida no usa `api()` a
 * propósito: ese apunta a la API y añade la cabecera de sesión, y aquí la
 * firma ya autoriza esa subida y sólo esa.
 *
 * Se valida tipo y tamaño ANTES de pedir la URL. El backend lo valida también
 * —quien use la URL a mano se salta el navegador— pero comprobarlo aquí evita
 * un viaje de ida y vuelta para decirle a alguien que su foto pesa 12 MB.
 */
export function FotoDePerfil({
  yo,
  onCambio,
}: {
  yo: CurrentUser;
  onCambio: (usuario: CurrentUser) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);

  async function subir(archivo: File) {
    if (!TIPOS.includes(archivo.type)) {
      toast.error("La foto tiene que ser JPG, PNG o WebP.");
      return;
    }
    if (archivo.size > MAX_BYTES) {
      toast.error("La foto no puede pasar de 5 MB.");
      return;
    }

    setOcupado(true);
    try {
      const { url, clave } = await api<{ url: string; clave: string }>(
        "/users/me/avatar/upload-url",
        {
          method: "POST",
          body: JSON.stringify({
            contentType: archivo.type,
            sizeBytes: archivo.size,
            nombreOriginal: archivo.name,
          }),
        },
      );

      const res = await fetch(url, {
        method: "PUT",
        body: archivo,
        // El tipo va FIRMADO: mandar otro hace que el almacenamiento devuelva
        // 403, que es exactamente lo que debe pasar.
        headers: { "content-type": archivo.type },
      });
      if (!res.ok) {
        throw new Error(
          `${res.status} — ${(await razonDeS3(res)) || "sin detalle"}`,
        );
      }

      const actualizado = await api<CurrentUser>("/users/me/avatar", {
        method: "PUT",
        body: JSON.stringify({ clave, nombreOriginal: archivo.name }),
      });
      onCambio(actualizado);
      avisarPerfilCambiado();
      toast.success("Foto actualizada");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? `No se pudo subir: ${err.message}`
            : "No se pudo subir la foto",
      );
    } finally {
      setOcupado(false);
      // Se limpia SIEMPRE: sin esto, volver a elegir el mismo archivo tras un
      // fallo no dispara `change` y parece que el botón dejó de funcionar.
      if (input.current) input.current.value = "";
    }
  }

  async function quitar() {
    setOcupado(true);
    try {
      onCambio(
        await api<CurrentUser>("/users/me/avatar", { method: "DELETE" }),
      );
      avisarPerfilCambiado();
      toast.success("Foto quitada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo quitar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar
        url={yo.avatarUrl ?? null}
        nombre={yo.name}
        correo={yo.email}
        size={72}
        className="text-primary ring-1 ring-black/5"
      />

      <div className="grid gap-2">
        <input
          ref={input}
          type="file"
          accept={TIPOS.join(",")}
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void subir(archivo);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ocupado}
            onClick={() => input.current?.click()}
          >
            {ocupado ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Subiendo…
              </>
            ) : (
              <>
                <Camera className="size-4" aria-hidden />
                {yo.avatarUrl ? "Cambiar foto" : "Subir foto"}
              </>
            )}
          </Button>
          {yo.avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={ocupado}
              onClick={() => void quitar()}
            >
              <Trash2 className="size-4" aria-hidden />
              Quitar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          JPG, PNG o WebP, hasta 5 MB. Sin foto se usan tus iniciales.
        </p>
      </div>
    </div>
  );
}
