"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Bell,
  Building2,
  ChevronRight,
  ClipboardList,
  Contact,
  CreditCard,
  DollarSign,
  KeyRound,
  LayoutDashboard,
  MessageSquareWarning,
  Package,
  PackageCheck,
  Plane,
  Receipt,
  Route as RouteIcon,
  Scale,
  ScrollText,
  TriangleAlert,
  Truck,
  Undo2,
  UserCog,
  Users,
  Warehouse,
} from "lucide-react";
import { Role } from "@/lib/api";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
};

type NavGroup = {
  /** `null` = sin encabezado: lo que se usa todo el día, siempre a la vista. */
  label: string | null;
  /**
   * Si este grupo se puede plegar.
   *
   * **Sólo los que son de verdad un bloque cerrado**, y no todos. Plegarlo todo
   * es aplicar el patrón donde no hace falta: deja el menú lleno de flechitas,
   * esconde a un clic cosas que se abren cada día y convierte la navegación en
   * un acordeón que hay que administrar. Un grupo se pliega cuando cumple las
   * dos condiciones: sus entradas son una sola cadena de trabajo, y hay
   * empresas que no la usan nunca.
   */
  plegable?: boolean;
  items: NavItem[];
};

/**
 * `roles` refleja lo que permite el backend, entrada por entrada. No es el
 * control de acceso —ese lo hace `RolesGuard`, y el menú se puede saltar
 * tecleando la URL—: es no ofrecer una pantalla que va a responder 403.
 */
const OFICINA: Role[] = ["OWNER", "ADMIN", "OPERATOR"];
const OFICINA_Y_SOPORTE: Role[] = [...OFICINA, "SUPPORT"];
const JEFES: Role[] = ["OWNER", "ADMIN"];

/**
 * El menú, agrupado por **momento de la operación** y no por módulo técnico.
 *
 * Antes había un grupo «Operación» con TRECE entradas seguidas. Trece elementos
 * bajo un solo encabezado no se leen: se recorren de arriba abajo cada vez, que
 * es justo lo que un menú viene a evitar. Y como el panel creció hasta 22
 * pantallas, la lista dejó de caber y apareció una barra de scroll.
 *
 * Inicio y Envíos van sin encabezado y siempre a la vista: son las dos que se
 * abren todos los días, y meterlas en un desplegable cambiaría un clic por dos
 * en lo más usado del producto.
 *
 * **Sólo dos grupos se pliegan** (ver `plegable`), no todos. La agrupación por
 * sí sola ya arregla lo que estaba mal —trece entradas seguidas—; los
 * desplegables son para los dos bloques que además hay empresas que no abren
 * nunca.
 */
const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      {
        href: "/dashboard",
        label: "Inicio",
        icon: LayoutDashboard,
        roles: OFICINA,
      },
      {
        href: "/shipments",
        label: "Envíos",
        icon: Package,
        roles: [...OFICINA_Y_SOPORTE, "DRIVER", "MERCHANT"],
      },
    ],
  },
  {
    label: "Bodega",
    items: [
      { href: "/intake", label: "Recepción", icon: PackageCheck, roles: OFICINA },
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
    ],
  },
  {
    // Se pliega: viaje -> manifiesto -> aduana es UNA cadena, y una empresa que
    // solo reparte en la ciudad no la abre nunca.
    label: "Carga y aduana",
    plegable: true,
    items: [
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
        href: "/carriers",
        label: "Transportistas",
        icon: Truck,
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
    label: "Reparto",
    items: [
      {
        href: "/routes",
        label: "Rutas",
        icon: RouteIcon,
        roles: [...OFICINA, "DRIVER"],
      },
      { href: "/drivers", label: "Repartidores", icon: Users, roles: OFICINA },
    ],
  },
  {
    // Las tres bandejas de «algo salió mal», juntas. Quien atiende una acaba
    // mirando las otras: la excepción la abre la bodega, el reclamo lo abre el
    // cliente y la devolución es a menudo el desenlace de los dos.
    label: "Incidencias",
    items: [
      {
        href: "/exceptions",
        label: "Excepciones",
        icon: TriangleAlert,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/claims",
        label: "Reclamos",
        icon: MessageSquareWarning,
        roles: OFICINA_Y_SOPORTE,
      },
      {
        href: "/returns",
        label: "Devoluciones",
        icon: Undo2,
        roles: OFICINA_Y_SOPORTE,
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
      { href: "/payments", label: "Pagos", icon: CreditCard, roles: OFICINA },
      { href: "/billing", label: "Facturación", icon: Receipt, roles: JEFES },
    ],
  },
  {
    // Se pliega: es la configuración. Se toca al montar la empresa y después
    // casi nunca, así que ocupa cuatro filas todos los días para nada.
    label: "Administración",
    plegable: true,
    items: [
      // La primera del grupo: la ficha de la empresa es lo que se busca al
      // entrar a configurar, más que las notificaciones.
      {
        href: "/empresa",
        label: "Mi empresa",
        icon: Building2,
        roles: JEFES,
      },
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

const CLAVE_ABIERTOS = "ruteo.nav.abiertos";

/** Grupos con al menos una pantalla visible para este rol. */
export function hayAlgoVisible(role: Role): boolean {
  return NAV.some((g) =>
    g.items.some((i) => !i.roles || i.roles.includes(role)),
  );
}

export function PanelNav({
  role,
  pathname,
}: {
  role: Role;
  pathname: string;
}) {
  const grupos = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
      })).filter((g) => g.items.length > 0),
    [role],
  );

  // El grupo de la pantalla en la que estás. Se calcula en cada render y no se
  // guarda: si se guardara, navegar dejaría abierto el grupo anterior y el
  // menú acabaría con todo abierto, que es volver a la lista de 22.
  const grupoActivo = useMemo(
    () =>
      grupos.find((g) => g.items.some((i) => pathname.startsWith(i.href)))
        ?.label ?? null,
    [grupos, pathname],
  );

  // Se lee en el INICIALIZADOR y no en un efecto, y se puede porque este
  // componente sólo llega a montarse en el cliente: `PanelLayout` devuelve
  // `null` hasta tener la sesión, que también sale de `localStorage`. Con un
  // efecto habría que pintar primero el valor por defecto y corregirlo después,
  // que es un parpadeo del menú entero en cada carga.
  const [abiertos, setAbiertos] = useState<string[]>(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_ABIERTOS);
      return guardado ? (JSON.parse(guardado) as string[]) : [];
    } catch {
      // Un valor corrupto no puede dejar el menú sin pintar.
      return [];
    }
  });

  function alternar(label: string) {
    const siguiente = abiertos.includes(label)
      ? abiertos.filter((l) => l !== label)
      : [...abiertos, label];
    setAbiertos(siguiente);
    // Guardar va AQUÍ, en el manejador, y no dentro del actualizador de estado
    // —que es donde estaba—. Un actualizador tiene que ser función pura de
    // `prev`; React lo invoca dos veces en desarrollo justo para detectar esto,
    // así que cada clic escribía dos veces en `localStorage`.
    try {
      window.localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(siguiente));
    } catch {
      // Sin localStorage el menú sigue funcionando, sólo no recuerda.
    }
  }

  return (
    <nav
      className={cn(
        "flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-2",
        // Barra de scroll fina y translúcida en vez de la del sistema, que
        // sobre el azul oscuro del panel se veía como una franja gris pegada.
        // Sigue existiendo —en una pantalla muy baja con todo desplegado hace
        // falta— pero deja de ser lo primero que se ve.
        "scroll-sutil",
      )}
    >
      {grupos.map((grupo) => {
        const lista = (
          <div className="flex flex-col gap-0.5">
            {grupo.items.map((item) => (
              <Entrada key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        );

        // Sin encabezado: lo que se usa a diario, siempre a la vista.
        if (!grupo.label) return <div key="principal">{lista}</div>;

        // Grupo normal: encabezado de texto y sus entradas debajo, como
        // siempre. La mayoría son esto. Un menú donde TODO se pliega deja al
        // usuario administrando un acordeón en vez de navegando.
        if (!grupo.plegable) {
          return (
            <div key={grupo.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/35">
                {grupo.label}
              </p>
              {lista}
            </div>
          );
        }

        // El grupo de la pantalla activa se abre siempre, lo hayas plegado o
        // no: verte trabajando en una pantalla cuyo grupo aparece cerrado es
        // lo que hace que un menú plegable se sienta roto.
        const activo = grupoActivo === grupo.label;
        const abierto = activo || abiertos.includes(grupo.label);

        return (
          <div key={grupo.label} className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => alternar(grupo.label!)}
              aria-expanded={abierto}
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/35 transition-colors hover:bg-white/5 hover:text-sidebar-foreground/70"
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 transition-transform duration-200",
                  abierto && "rotate-90",
                )}
                aria-hidden
              />
              <span className="flex-1 text-left">{grupo.label}</span>
              {/* Plegado dice cuántas hay dentro: sin esto, un grupo cerrado no
                  distingue «no tiene nada» de «tiene cuatro». */}
              {!abierto && (
                <span className="tabular-nums text-sidebar-foreground/25">
                  {grupo.items.length}
                </span>
              )}
            </button>

            {abierto && lista}
          </div>
        );
      })}
    </nav>
  );
}

function Entrada({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, icon: Icon } = item;
  const activo = pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={cn(
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
}
