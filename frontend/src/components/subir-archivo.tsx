"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Sube un archivo al almacenamiento y devuelve con qué referenciarlo.
 *
 * **El archivo no pasa por el backend.** Se pide una URL firmada, el navegador
 * hace `PUT` directo contra MinIO y lo que vuelve es la clave. Por eso el
 * `fetch` de la subida NO usa el ayudante `api()`: ese apunta a la API y añade
 * la cabecera de sesión, y ninguna de las dos cosas va aquí —la firma ya
 * autoriza esa subida y solo esa—.
 *
 * Dos formas de referenciar lo subido, y la diferencia importa:
 *
 *  - **por clave** (`confirmar={false}`): la prueba de entrega, que tiene dos
 *    huecos fijos y los guarda en columnas. No crea fila de metadatos.
 *  - **por `fileId`** (`confirmar`): las fotos de un bulto, que son N y
 *    necesitan filas para poder listarse y contarse.
 *
 * Confirmar cuando no hace falta dejaría filas de `FileObject` que nada
 * referencia, que es basura con la que además hay que cargar.
 */

export interface ArchivoSubido {
  clave: string;
  /** Solo cuando `confirmar` está activo. */
  fileId?: string;
}

interface Props {
  categoria: "prueba-entrega" | "fotos-paquete" | "documentos";
  /** La parada o el bulto al que cuelga. Va dentro de la clave. */
  propietarioId: string;
  onSubido: (archivo: ArchivoSubido | null) => void;
  /** Crea la fila de metadatos y devuelve `fileId`. */
  confirmar?: boolean;
  etiqueta?: string;
  /** `camara` abre la cámara trasera en móvil; `archivo` abre el explorador. */
  modo?: "camara" | "archivo";
  accept?: string;
}

type Estado = "vacio" | "subiendo" | "listo";

/**
 * Saca el motivo del XML de error de S3.
 *
 * No se parsea con `DOMParser` ni se trae una librería: son dos etiquetas y el
 * cuerpo puede no ser XML válido si quien responde es un proxy por medio. Una
 * expresión regular tolerante devuelve algo útil en los dos casos, que es lo que
 * hace falta cuando lo que se busca es poder reportar el fallo.
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

export function SubirArchivo({
  categoria,
  propietarioId,
  onSubido,
  confirmar = false,
  etiqueta = "Archivo",
  modo = "camara",
  accept = "image/*",
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>("vacio");
  const [nombre, setNombre] = useState("");

  async function subir(archivo: File) {
    setEstado("subiendo");
    try {
      const { url, clave } = await api<{ url: string; clave: string }>(
        "/files/upload-url",
        {
          method: "POST",
          body: JSON.stringify({
            categoria,
            propietarioId,
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
        // El cuerpo del error trae el motivo REAL —`SignatureDoesNotMatch`,
        // `XAmzContentSHA256Mismatch`, `EntityTooLarge`…— en un XML de S3.
        // Antes se descartaba y quedaba «respondió 403», que no permite
        // distinguir un problema de firma de uno de permisos ni de tamaño, y
        // deja a quien lo sufre sin nada que reportar.
        throw new Error(
          `${res.status} — ${(await razonDeS3(res)) || "sin detalle"}`,
        );
      }

      let fileId: string | undefined;
      if (confirmar) {
        const fila = await api<{ id: string }>("/files/confirm", {
          method: "POST",
          body: JSON.stringify({ clave, nombreOriginal: archivo.name }),
        });
        fileId = fila.id;
      }

      setNombre(archivo.name);
      setEstado("listo");
      onSubido({ clave, fileId });
    } catch (err) {
      setEstado("vacio");
      onSubido(null);
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? `No se pudo subir: ${err.message}`
            : "No se pudo subir el archivo",
      );
    }
  }

  function quitar() {
    setEstado("vacio");
    setNombre("");
    onSubido(null);
    if (input.current) input.current.value = "";
  }

  const Icono = modo === "camara" ? Camera : Paperclip;

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{etiqueta}</span>

      <input
        ref={input}
        type="file"
        accept={accept}
        // En un móvil abre la cámara trasera en vez del carrete, que es lo que
        // quiere alguien de pie con el bulto delante.
        {...(modo === "camara" ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void subir(archivo);
        }}
      />

      {estado === "listo" ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          <Check className="size-4 text-emerald-600" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{nombre}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={quitar}
            aria-label="Quitar"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={estado === "subiendo"}
          onClick={() => input.current?.click()}
        >
          {estado === "subiendo" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Subiendo…
            </>
          ) : (
            <>
              <Icono className="size-4" aria-hidden />
              {modo === "camara" ? "Tomar o elegir foto" : "Elegir archivo"}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
