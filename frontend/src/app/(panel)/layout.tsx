"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
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
  Truck,
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
const NAV: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operación",
    items: [
      { href: "/shipments", label: "Envíos", icon: Package },
      { href: "/routes", label: "Rutas", icon: RouteIcon },
      { href: "/drivers", label: "Repartidores", icon: Users },
      { href: "/intake", label: "Recepción", icon: PackageCheck },
      { href: "/lockers", label: "Casilleros", icon: Archive },
      { href: "/carriers", label: "Transportistas", icon: Plane },
    ],
  },
  {
    label: "Comercial",
    items: [
      { href: "/customers", label: "Clientes", icon: Contact },
      { href: "/pricing", label: "Zonas y tarifas", icon: DollarSign },
      { href: "/payments", label: "Pagos", icon: CreditCard },
      { href: "/billing", label: "Facturación", icon: Receipt },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/notifications", label: "Notificaciones", icon: Bell },
      { href: "/team", label: "Equipo", icon: UserCog, roles: ["OWNER", "ADMIN"] },
      // El backend restringe `GET /audit` a OWNER/ADMIN; el NAV refleja lo
      // mismo para no ofrecer una pantalla que responderá 403.
      {
        href: "/audit",
        label: "Auditoría",
        icon: ScrollText,
        roles: ["OWNER", "ADMIN"],
      },
      { href: "/integrations", label: "Integraciones", icon: KeyRound },
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

  return (
    <div className="flex flex-1 min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/5 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
            <Truck className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-tight tracking-wide">
              Ruteo
            </span>
            <span className="block truncate text-[11px] leading-tight text-sidebar-foreground/50">
              {session.slug}
            </span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-2">
          {NAV.map((grupo) => {
            const items = grupo.items.filter(visible);
            if (items.length === 0) return null;
            return (
              <div key={grupo.label ?? "principal"} className="flex flex-col gap-0.5">
                {grupo.label ? (
                  <p className="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/35">
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
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
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

        <div className="border-t border-sidebar-border p-3 text-xs">
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
        </div>
      </aside>

      <div className="panel-surface flex min-w-0 flex-1 flex-col">
        {/* Barra superior: el buscador global vive aquí para que esté a un
            clic (o ⌘K) desde cualquier pantalla. */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-white/70 px-6 backdrop-blur-md lg:px-8">
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

        <main className="min-w-0 flex-1 overflow-x-auto p-6 lg:p-8">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
