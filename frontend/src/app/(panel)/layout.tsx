"use client";

import { ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import { api, clearSession, CurrentUser } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSesion } from "@/lib/use-sesion";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/logistics";
import { Avatar } from "@/components/avatar";
import { EVENTO_PERFIL } from "@/lib/eventos";
import { Button } from "@/components/ui/button";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/command-palette";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
// El menú vive aparte desde que se pliega: es estado, y tenerlo aquí mezclaba
// la navegación con el armazón de la página, que no tiene nada que ver.
import { hayAlgoVisible, PanelNav } from "./nav";

export default function PanelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { sesion: session, resuelto: ready } = useSesion();
  // La foto no cabe en la sesión guardada: su URL viene firmada y caduca en
  // minutos, así que hay que pedirla al servidor y no leerla de `localStorage`.
  //
  // `VerifyEmailBanner` pide esta MISMA ruta. Antes eran dos peticiones en cada
  // carga del panel, y el comentario que había aquí las daba por buenas
  // ("una llamada barata"). Ya no: al compartir clave con `useApi`, SWR las
  // sirve de una sola petición, y las dos pantallas siguen siendo
  // independientes —que era la objeción a unificarlas— porque ninguna sabe de
  // la otra. Verificar el correo invalida la clave y las dos se enteran.
  const { datos: yo, recargar: recargarPerfil } = useApi<CurrentUser>(
    session ? "/users/me" : null,
    { silencioso: true },
  );
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Al navegar se cierra solo. Sin esto, en el teléfono tocas una entrada y el
  // cajón se queda encima de la pantalla a la que acabas de ir.
  //
  // Ajustado durante el render y no desde un efecto: es la forma que documenta
  // React para «cambiar estado cuando cambian los datos que entran», y evita el
  // render en cascada que marca `react-hooks/set-state-in-effect`. Mismo patrón
  // que `usePagina`.
  const [rutaPrevia, setRutaPrevia] = useState(pathname);
  if (rutaPrevia !== pathname) {
    setRutaPrevia(pathname);
    if (menuAbierto) setMenuAbierto(false);
  }

  // Escape cierra, como cualquier capa que tapa la pantalla.
  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [menuAbierto]);

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  useEffect(() => {
    // El menú NO se vuelve a montar al navegar, así que sin escuchar esto la
    // foto recién cambiada seguiría siendo la vieja hasta recargar la página.
    const alCambiar = () => void recargarPerfil();
    window.addEventListener(EVENTO_PERFIL, alCambiar);
    return () => window.removeEventListener(EVENTO_PERFIL, alCambiar);
  }, [recargarPerfil]);

  async function onLogout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // la sesión local se limpia igual
    }
    clearSession();
    router.replace("/login");
  }

  if (!ready || !session) return null;

  // Hoy solo le pasa a CUSTOMER, que no tiene ninguna pantalla del panel. Sin
  // esto vería la barra lateral vacía y un área en blanco, sin forma de saber
  // si es un fallo o si le falta un permiso.
  if (!hayAlgoVisible(session.role)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Tu cuenta no usa el panel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Con el perfil {ROLE_LABELS[session.role]} puedes seguir tus envíos
            desde el rastreo público. Si crees que deberías tener acceso al
            panel, pídeselo a quien administra la cuenta.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link href="/track">Ir al rastreo</Link>
            </Button>
            <Button variant="outline" onClick={onLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    // El panel es un armazón de altura fija: la VENTANA no scrollea nunca y el
    // único que scrollea es `main`. Antes esto era `min-h-screen`, así que el
    // documento crecía con el contenido y pasaban dos cosas a la vez: salía una
    // segunda barra de scroll (la ventana además de la de `main`, que se hacía
    // scrollable sin querer, ver más abajo) y la rueda del ratón movía uno u
    // otro contenedor según dónde estuviera el puntero.
    //
    // `h-dvh` y no `h-screen`: en el móvil la barra de direcciones se recoge al
    // scrollear y `100vh` deja cortado justo lo de abajo del todo.
    <div className="flex h-dvh overflow-hidden">
      {/* Fondo del cajón. Solo existe por debajo de `lg` y con el menú abierto:
          a partir de ahí el menú es una columna más y no tapa nada. */}
      {menuAbierto ? (
        <div
          onClick={() => setMenuAbierto(false)}
          aria-hidden
          className="fixed inset-0 z-40 bg-[#04151f]/40 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      {/* Alto completo y fijo. Estirándose con el documento —que es lo que hacía
          antes— el menú se iba hacia arriba al scrollear y dejaba una columna
          oscura vacía debajo.

          **Hasta `lg` es un cajón que se desliza; desde `lg`, una columna fija.**
          Antes era siempre una columna de 240 px sin ningún breakpoint, y en un
          teléfono de 375 px se comía dos tercios de la pantalla: al contenido le
          quedaban 135. No era un caso hipotético —el menú da a `DRIVER` las
          entradas de Envíos y Rutas, o sea que se espera que un repartidor entre
          desde el teléfono.

          Se traslada en vez de desmontarse para que la transición exista y para
          que el menú no se reconstruya en cada apertura. */}
      <aside
        id="menu-panel"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-white/5 bg-sidebar text-sidebar-foreground transition-transform duration-200",
          "lg:static lg:z-auto lg:h-full lg:translate-x-0 lg:transition-none",
          menuAbierto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* El SVG es el lockup completo (símbolo + palabra) en su versión
            negativa, para el fondo oscuro del sidebar: ocupa el sitio de la
            pastilla del icono y del rótulo. El slug del tenant se queda: no es
            decoración, es en qué empresa estás trabajando. */}
        <div className="px-4 py-3">
          <Image
            src="/logo-negativo.svg"
            alt="Ruteo"
            width={120}
            height={32}
            priority
            className="h-8 w-auto"
          />
          <span className="mt-2 block truncate text-[11px] leading-tight text-sidebar-foreground/50">
            {session.slug}
          </span>
        </div>

        <PanelNav role={session.role} pathname={pathname} />

        <div className="border-t border-sidebar-border px-3 py-2 text-xs">
          {/* El bloque del usuario ES el enlace a su perfil. Es donde la gente
              va a buscar sus datos —el sitio donde ya está su nombre— y así no
              hace falta una entrada más en la navegación, que es lo que se
              acaba de adelgazar. El cambio de contraseña se fue a esa pantalla:
              aquí abajo, pegado a «Cerrar sesión», no lo encontraba nadie. */}
          <Link
            href="/perfil"
            className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-white/5"
          >
            <Avatar
              url={yo?.avatarUrl ?? null}
              nombre={yo?.name ?? session.name}
              correo={yo?.email ?? session.email}
              size={32}
              className="bg-white/10 text-sidebar-foreground"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {yo?.name || session.name || session.email}
              </span>
              <span className="block truncate text-sidebar-foreground/60">
                {ROLE_LABELS[session.role]} · Ver mi perfil
              </span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="mt-1 w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>

          {/* Crédito del desarrollador: al pie del sidebar, en el tono más
              tenue disponible. Está presente sin robarle sitio a la navegación,
              que es lo que se usa todo el día. */}
          <p className="mt-2 border-t border-sidebar-border pt-2 text-[10px] leading-tight text-sidebar-foreground/40">
            Desarrollado por{" "}
            <a
              href="https://www.brandsofts.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded font-medium text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-foreground/60"
            >
              Brandsofts
            </a>
          </p>
        </div>
      </aside>

      <div className="panel-surface flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barra superior: el buscador global vive aquí para que esté a un
            clic (o ⌘K) desde cualquier pantalla.
            Ya no necesita `sticky`: al estar FUERA del contenedor que scrollea
            se queda quieta por estructura. */}
        <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-white/70 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          {/* Abre el menú. Desaparece desde `lg`, donde el menú ya está fijo. */}
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir el menú"
            aria-expanded={menuAbierto}
            aria-controls="menu-panel"
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/8 lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-xl border border-border/80 bg-white/80 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/25 hover:bg-white"
          >
            <Search className="size-4" />
            {/* El rótulo largo no cabe en un teléfono junto a la hamburguesa. */}
            <span className="flex-1 truncate text-left">
              <span className="sm:hidden">Buscar…</span>
              <span className="hidden sm:inline">Buscar en todo el panel…</span>
            </span>
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] sm:block">
              ⌘K
            </kbd>
          </button>
        </header>

        {/* El ÚNICO contenedor que scrollea de todo el panel.
            Antes ponía `overflow-x-auto` a secas, y ahí estaba la segunda barra:
            en CSS, en cuanto un eje deja de ser `visible` el otro pasa de
            `visible` a `auto` solo. O sea que pedir scroll horizontal para las
            tablas anchas activaba también el vertical, y el documento seguía
            scrolleando por su cuenta. Ahora se declara entero y a propósito. */}
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <VerifyEmailBanner />
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
