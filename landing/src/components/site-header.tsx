"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP } from "@/lib/app-url";
import { cn } from "@/lib/utils";

// Enlaces a secciones de la propia página.
const SECCIONES = [
  { href: "#operacion", label: "Producto" },
  { href: "#internacional", label: "Internacional" },
  { href: "#api", label: "API" },
  { href: "#precios", label: "Precios" },
];

export function SiteHeader() {
  // Arriba del todo la barra es invisible y deja ver la foto del hero; en
  // cuanto se baja, se vuelve un cristal blanco para que el texto que pasa por
  // debajo no se mezcle con el de la barra.
  const [bajada, setBajada] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const alScroll = () => setBajada(window.scrollY > 24);
    // Se llama una vez por si la página se abre ya desplazada (ancla, recarga).
    alScroll();
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [menuAbierto]);

  // Sección en curso, para marcarla en el menú. Con observador y no con un
  // manejador de scroll: la barra ya tiene uno y este cálculo no necesita
  // correr en cada píxel, solo cuando una sección entra o sale de la banda.
  const [activa, setActiva] = useState<string | null>(null);

  useEffect(() => {
    const ids = SECCIONES.map((s) => s.href.slice(1));
    const nodos = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n !== null);
    if (nodos.length === 0) return;

    const dentro = new Set<string>();

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) dentro.add(e.target.id);
          else dentro.delete(e.target.id);
        }
        // La ÚLTIMA en orden del documento, no la primera: las secciones son
        // altas y al pasar de una a la siguiente ambas cruzan la banda a la
        // vez; la de más abajo es hacia la que se está entrando.
        const actual = [...ids].reverse().find((id) => dentro.has(id)) ?? null;
        setActiva(actual);
      },
      // Banda estrecha justo debajo de la barra (h-16) y hasta el 40% de la
      // altura de la ventana. Sin recortar por abajo, una sección contaría
      // como activa con solo asomar por el borde inferior.
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    nodos.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  // Con el menú desplegado la barra va opaca aunque estemos arriba: si no, el
  // panel abierto flota sobre la foto y no se lee.
  const solida = bajada || menuAbierto;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 transition-[background-color,border-color,backdrop-filter] duration-300",
        solida
          ? "border-b border-primary/8 bg-white/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center gap-6 px-5 sm:px-8">
        {/* El SVG ya es el lockup completo (símbolo + palabra), así que ocupa
            el sitio del icono y del texto que había aquí. `priority` porque
            está sobre el pliegue y entra en el LCP del hero. */}
        <Link
          href="/"
          className="flex shrink-0 items-center rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <Image
            src="/logo.svg"
            alt="Ruteo"
            width={120}
            height={32}
            priority
            className="h-8 w-auto"
          />
        </Link>

        {/* `min-w-0` para que la lista pueda encoger en vez de empujar los
            botones fuera de la barra, y el hueco entre enlaces más corto en
            `md`: ahí caben justos el logo, cuatro enlaces y tres botones, y el
            logo nuevo es más ancho que el lockup que había antes. */}
        <nav className="hidden min-w-0 flex-1 items-center gap-5 md:flex lg:gap-7">
          {SECCIONES.map((s) => {
            const esActiva = activa === s.href.slice(1);
            return (
              <a
                key={s.href}
                href={s.href}
                aria-current={esActiva ? "location" : undefined}
                className={cn(
                  // El subrayado es un pseudoelemento absoluto y lo único que
                  // cambia del texto es el color: marcar la sección no altera
                  // el grosor ni la caja, así que los enlaces de al lado no se
                  // mueven al ir bajando por la página.
                  "relative rounded text-sm transition-colors after:absolute after:-bottom-1.5 after:left-0 after:h-px after:bg-primary/45 after:transition-[width] after:duration-300 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary",
                  esActiva
                    ? "text-primary after:w-full"
                    : "text-muted-foreground after:w-0 hover:text-primary",
                )}
              >
                {s.label}
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
          {/* El rastreo va primero y en texto: es lo que viene a hacer la mayor
              parte de quien llega al dominio, y no debe competir en peso con el
              alta de una empresa. */}
          {/* `a` y no `Link`: estas tres viven en el panel, que es otro dominio.
              El router no puede navegar ahí en cliente. */}
          <Button asChild variant="ghost" size="sm" className="hidden md:flex">
            <a href={APP.track}>Rastrear guía</a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:flex">
            <a href={APP.login}>Iniciar sesión</a>
          </Button>
          <Button asChild size="sm" className="md:ml-1">
            <a href={APP.register}>Crear cuenta</a>
          </Button>

          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
            aria-controls="menu-movil"
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
            className="-mr-1.5 ml-0.5 flex size-9 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
          >
            {menuAbierto ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </button>
        </div>
      </div>

      {/* Panel móvil. Es un desplegable dentro de la barra y no una capa a
          pantalla completa: son seis enlaces, y tapar la página entera para
          enseñarlos obliga a cerrar antes de poder mirar nada. */}
      <div
        id="menu-movil"
        hidden={!menuAbierto}
        className="border-t border-primary/8 bg-white/95 backdrop-blur-xl md:hidden"
      >
        <nav className="mx-auto flex w-full max-w-[90rem] flex-col px-5 py-3">
          {SECCIONES.map((s) => {
            const esActiva = activa === s.href.slice(1);
            return (
              <a
                key={s.href}
                href={s.href}
                aria-current={esActiva ? "location" : undefined}
                onClick={() => setMenuAbierto(false)}
                className={cn(
                  "rounded-lg px-2 py-2.5 text-[15px] transition-colors hover:bg-primary/5 hover:text-primary",
                  esActiva ? "bg-primary/5 text-primary" : "text-foreground/85",
                )}
              >
                {s.label}
              </a>
            );
          })}

          <div className="mt-2 flex flex-col gap-2 border-t border-primary/8 pt-3">
            <a
              href={APP.track}
              onClick={() => setMenuAbierto(false)}
              className="rounded-lg px-2 py-2.5 text-[15px] font-medium text-primary transition-colors hover:bg-primary/5"
            >
              Rastrear una guía
            </a>
            <a
              href={APP.login}
              onClick={() => setMenuAbierto(false)}
              className="rounded-lg px-2 py-2.5 text-[15px] font-medium text-primary transition-colors hover:bg-primary/5 sm:hidden"
            >
              Iniciar sesión
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
