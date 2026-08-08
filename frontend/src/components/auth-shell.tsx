import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

// Composición de las pantallas de acceso, calcada de la referencia: sobre un
// lienzo oscuro, una tarjeta oscura con el formulario y una tarjeta clara que
// FLOTA por encima, desplazada hacia la izquierda y sobresaliendo por la derecha.
// El solape es lo que da la sensación de capas; sin él quedan dos mitades planas.

export function AuthShell({
  children,
  aside,
  stepper,
}: {
  children: ReactNode;
  aside: ReactNode;
  stepper?: ReactNode;
}) {
  return (
    <div className="brand-dark auth-photo flex min-h-screen flex-1 items-center justify-center px-4 py-10 sm:px-8">
      {/* z-10: el filtro de marca va en un ::after, que de otro modo se
          pintaría por encima del formulario. */}
      <div className="relative z-10 w-full max-w-5xl">
        {stepper}
        <div className="relative lg:grid lg:grid-cols-[1.45fr_1fr] lg:items-center">
          {/* pr-44 reserva el carril que la tarjeta clara invade; sin ese hueco
              el formulario quedaría por debajo de la tarjeta flotante. */}
          <div className="auth-panel rounded-3xl px-7 py-9 sm:px-10 lg:pr-44">
            {children}
          </div>
          <div className="relative z-10 mt-6 lg:mt-0 lg:-ml-40">{aside}</div>
        </div>

        <CreditoBrandsofts />
      </div>
    </div>
  );
}

// Crédito del desarrollador. Va al pie del lienzo y no dentro de la tarjeta:
// aquí acompaña sin competir con el formulario, que es lo único que la persona
// ha venido a hacer.
export function CreditoBrandsofts({
  className,
}: {
  className?: string;
}) {
  return (
    <p className={cn("mt-8 text-center text-xs text-white/35", className)}>
      Desarrollado por{" "}
      <a
        href="https://www.brandsofts.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded font-medium text-white/60 underline decoration-white/20 underline-offset-2 transition-colors hover:text-white hover:decoration-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        Brandsofts
      </a>
    </p>
  );
}

// Regla fina con el tramo recorrido en el verde claro de marca y la etiqueta a
// la derecha, como el "Step 3 of 3" de la referencia.
export function AuthStepper({
  paso,
  total,
  etiqueta,
}: {
  paso: number;
  total: number;
  etiqueta: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-4 px-1">
      <div className="relative h-px flex-1 bg-white/12">
        <span
          className="absolute inset-y-0 left-0 bg-[#56b3a5] transition-[width] duration-300"
          style={{ width: `${(paso / total) * 100}%` }}
        />
      </div>
      {/* Más opaco que el resto del texto secundario: esta línea cae sobre la
          zona clara del cielo de la foto, donde white/55 se desvanece. */}
      <p className="shrink-0 text-xs text-white/75">
        Paso {paso} de {total}: {etiqueta}
      </p>
    </div>
  );
}

export function AuthBrand() {
  return (
    <Link
      href="/"
      className="mb-7 block w-fit rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#56b3a5]"
    >
      {/* El logotipo negativo (blanco) porque el panel del formulario es
          oscuro. Las medidas son las intrínsecas del SVG (1785×470) reducidas:
          Next las usa solo para reservar el hueco, la altura real la fija h-8. */}
      <Image
        src="/logo-negativo.svg"
        alt="Ruteo"
        width={122}
        height={32}
        preload
        className="h-8 w-auto"
      />
    </Link>
  );
}

export function AuthBack({
  href,
  onClick,
  children = "Atrás",
}: {
  href?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const clase =
    "mb-4 inline-flex items-center gap-1.5 rounded text-sm text-white/50 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]";

  if (href) {
    return (
      <Link href={href} className={clase}>
        <ArrowLeft className="size-4" />
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={clase}>
      <ArrowLeft className="size-4" />
      {children}
    </button>
  );
}

export function AuthHeading({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="mb-7 space-y-2.5">
      <h1 className="text-[2rem] font-semibold leading-[1.15] tracking-tight text-white text-balance">
        {title}
      </h1>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-white/50">
          {description}
        </p>
      ) : null}
    </div>
  );
}

// ---- tarjeta clara flotante ---------------------------------------------

export function AuthAside({
  title,
  description,
  bullets,
  children,
}: {
  title: ReactNode;
  description: string;
  bullets: string[];
  children?: ReactNode;
}) {
  return (
    // Sin insignia de icono: el logotipo ya identifica a la marca en el
    // formulario y repetirlo aquí solo duplicaba el mismo símbolo en pantalla.
    <div className="auth-float flex flex-col gap-5 rounded-3xl p-7">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-primary text-balance">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2.5 text-sm leading-snug text-foreground/85"
          >
            <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-2.5" strokeWidth={3.5} />
            </span>
            {b}
          </li>
        ))}
      </ul>

      {children}
    </div>
  );
}

// Misma caja anidada con tinte, pero cuando lo que toca ofrecer es una salida y
// no un resumen. En el login sirve a quien llega solo a rastrear una guía y no
// tiene por qué crear cuenta.
export function AuthAsideCta({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl bg-[#eaf2f0] p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary/70">
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {cta}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

// Tarjeta anidada con tinte de marca: chips en versalitas, filas etiqueta →
// valor y una última fila separada y más pesada para el dato que remata.
export function AuthSummary({
  title,
  chips,
  rows,
  total,
}: {
  title: string;
  chips?: string[];
  rows: { label: string; value: ReactNode }[];
  total?: { label: string; value: ReactNode };
}) {
  return (
    <div className="rounded-2xl bg-[#eaf2f0] p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary/70">
        {title}
      </p>

      {chips && chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-primary ring-1 ring-primary/10"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="mt-4 flex flex-col gap-2.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-4 text-sm"
          >
            <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-foreground">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {total ? (
        <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-primary/12 pt-3.5">
          <span className="font-medium text-foreground">{total.label}</span>
          <span className="text-lg font-semibold tracking-tight text-primary">
            {total.value}
          </span>
        </div>
      ) : null}
    </div>
  );
}
