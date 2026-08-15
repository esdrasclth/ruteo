"use client";

import { ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Scale,
  Warehouse,
  ClipboardList,
  TriangleAlert,
  Archive,
  Bell,
  CreditCard,
  DollarSign,
  Contact,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  PackageCheck,
  Plane,
  Receipt,
  Route as RouteIcon,
  ScrollText,
  Search,
  Users,
  UserCog,
} from "lucide-react";
import { api, clearSession, getSession, Role, Session } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/logistics";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/command-palette";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { ChangePasswordDialog } from "./change-password-dialog";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
};

type NavGroup = { label: string | null; items: NavItem[] };

// Agrupado por cómo se trabaja, no por módulo técnico: una lista plana de 15
// entradas obliga a leerlas todas cada vez para encontrar una.
//
// `roles` refleja lo que permite el backend, entrada por entrada. No es el
// control de acceso —ese lo hace `RolesGuard`, y el NAV se puede saltar
// tecleando la URL—: es no ofrecer una pantalla que va a responder 403. Antes
// solo Equipo y Auditoría lo declaraban, así que un CUSTOMER veía el panel
// entero; ahora que el backend deniega por defecto, ofrecerlo todo sería
// enseñar quince pantallas rotas.
const OFICINA: Role[] = ["OWNER", "ADMIN", "OPERATOR"];
const OFICINA_Y_SOPORTE: Role[] = [...OFICINA, "SUPPORT"];
const JEFES: Role[] = ["OWNER", "ADMIN"];

const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      // Una sola entrada. Hubo dos —«Dashboard» y «Tablero»— y era un error:
      // son la misma palabra en dos idiomas, así que el menú obligaba a
      // adivinar cuál abrir, y encima enseñaban cifras distintas de lo que
      // parecía lo mismo porque una filtraba por rango de fechas y la otra no.
      // Ahora es una pantalla con dos mitades: «Ahora» y «En el período».
      {
        href: "/dashboard",
        label: "Inicio",
        icon: LayoutDashboard,
        roles: OFICINA,
      },
    ],
  },
  {
    label: "Operación",
    items: [
      {
        href: "/shipments",
        label: "Envíos",
        icon: Package,
        roles: [...OFICINA_Y_SOPORTE, "DRIVER", "MERCHANT"],
      },
      {
        href: "/routes",
        label: "Rutas",
        icon: RouteIcon,
        roles: [...OFICINA, "DRIVER"],
      },
      { href: "/drivers", label: "Repartidores", icon: Users, roles: OFICINA },
      {
        href: "/intake",
        label: "Recepción",
        icon: PackageCheck,
        roles: OFICINA,
      },
      {
        href: "/lockers",
        label: "Casilleros",
        icon: Archive,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/warehouses",
        label: "Bodegas",
        icon: Warehouse,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/carriers",
        label: "Transportistas",
        icon: Plane,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/trips",
        label: "Viajes",
        icon: Plane,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/manifests",
        label: "Manifiestos",
        icon: ClipboardList,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/exceptions",
        label: "Excepciones",
        icon: TriangleAlert,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/customs",
        label: "Reglas de aduana",
        icon: Scale,
        roles: JEFES,
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      {
        href: "/customers",
        label: "Clientes",
        icon: Contact,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/pricing",
        label: "Zonas y tarifas",
        icon: DollarSign,
        roles: OFICINA,
      },
      {
        href: "/payments",
        label: "Pagos",
        icon: CreditCard,
        roles: OFICINA,
      },
      { href: "/billing", label: "Facturación", icon: Receipt, roles: JEFES },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        href: "/notifications",
        label: "Notificaciones",
        icon: Bell,
        roles: OFICINA,
      },
      { href: "/team", label: "Equipo", icon: UserCog, roles: JEFES },
      { href: "/audit", label: "Auditoría", icon: ScrollText, roles: JEFES },
      {
        href: "/integrations",
        label: "Integraciones",
        icon: KeyRound,
        roles: JEFES,
      },
    ],
  },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSessionState(s);
    setReady(true);
  }, [router]);

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

  const visible = (item: NavItem) =>
    !item.roles || item.roles.includes(session.role);

  // Hoy solo le pasa a CUSTOMER, que no tiene ninguna pantalla del panel. Sin
  // esto vería la barra lateral vacía y un área en blanco, sin forma de saber
  // si es un fallo o si le falta un permiso.
  if (!NAV.some((grupo) => grupo.items.some(visible))) {
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
      {/* Alto completo y fijo. Estirándose con el documento —que es lo que hacía
          antes— el menú se iba hacia arriba al scrollear y dejaba una columna
          oscura vacía debajo. */}
      <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/5 bg-sidebar text-sidebar-foreground">
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

        {/* `overscroll-contain` es lo que quita el comportamiento raro: sin él,
            al llegar al final del menú la rueda seguía y arrastraba el panel de
            al lado, así que mover el menú movía la pantalla entera.
            `overflow-y-auto` se queda porque no scrollea cuando cabe, y con 20
            entradas + cabecera + pie no cabe por debajo de ~1060px de alto: sin
            él, en un portátil normal quedarían fuera de alcance las últimas
            entradas y el botón de cerrar sesión. */}
        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2 pb-1">
          {NAV.map((grupo) => {
            const items = grupo.items.filter(visible);
            if (items.length === 0) return null;
            return (
              <div key={grupo.label ?? "principal"} className="flex flex-col gap-0.5">
                {grupo.label ? (
                  <p className="px-3 pb-0.5 pt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/35">
                    {grupo.label}
                  </p>
                ) : null}
                {items.map(({ href, label, icon: Icon }) => {
                  const activo = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={activo ? "page" : undefined}
                      className={cn(
                        // `py-1.5` y no `py-2`: son 4px por entrada y con 20
                        // entradas eso es lo que decide si el menú cabe en un
                        // portátil o hay que scrollearlo para llegar al final.
                        "group flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-all",
                        activo
                          ? "glass-active text-sidebar-foreground"
                          : "text-sidebar-foreground/65 hover:bg-white/5 hover:text-sidebar-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          activo
                            ? "text-sidebar-foreground"
                            : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
                        )}
                      />
                      {label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border px-3 py-2 text-xs">
          <p className="truncate font-medium">{session.name || session.email}</p>
          <p className="truncate text-sidebar-foreground/60">
            {ROLE_LABELS[session.role]}
          </p>
          <ChangePasswordDialog />
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
        <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-white/70 px-6 backdrop-blur-md lg:px-8">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-xl border border-border/80 bg-white/80 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/25 hover:bg-white"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar en todo el panel…</span>
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
        <main className="min-w-0 flex-1 overflow-auto p-6 lg:p-8">
          <VerifyEmailBanner />
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
