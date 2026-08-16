import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Las iniciales de una persona.
 *
 * Del nombre si lo hay; si no, de la parte del correo antes de la arroba. Sin
 * esa segunda vía, quien todavía no ha puesto su nombre —lo normal en una
 * cuenta recién invitada— vería un círculo vacío justo donde debería estar él.
 */
export function iniciales(nombre: string | null, correo: string): string {
  const base = nombre?.trim() || correo.split("@")[0].replace(/[._-]+/g, " ");
  const partes = base.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Foto de perfil, con iniciales cuando no la hay.
 *
 * `unoptimized` no es pereza: la URL viene firmada y caduca en minutos, así que
 * el optimizador de Next la cachearía y serviría una imagen cuya firma ya no
 * vale. Además cambia en cada carga, con lo que la caché no acertaría nunca.
 *
 * `loading="eager"` porque el defecto de `next/image` es `lazy`, y con él el
 * avatar del menú se quedaba sin cargar: es un elemento de 32 píxeles que está
 * SIEMPRE a la vista, así que diferirlo no ahorra nada y deja un círculo vacío
 * en la parte del panel que más se mira. Costó encontrarlo porque la URL
 * respondía 200 y la imagen decodificaba: lo que fallaba no era la foto, era
 * que el navegador no había llegado a pedirla.
 */
export function Avatar({
  url,
  nombre,
  correo,
  size = 32,
  className,
}: {
  url: string | null;
  nombre: string | null;
  correo: string;
  size?: number;
  className?: string;
}) {
  const clases = cn(
    "shrink-0 overflow-hidden rounded-full bg-primary/10 object-cover",
    className,
  );

  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        unoptimized
        loading="eager"
        className={clases}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        clases,
        "flex items-center justify-center font-medium uppercase",
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {iniciales(nombre, correo)}
    </span>
  );
}
