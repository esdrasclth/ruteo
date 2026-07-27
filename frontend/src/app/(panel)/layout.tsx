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
  Truck,
  Users,
  UserCog,
} from "lucide-react";
import { api, clearSession, getSession, Role, Session } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/logistics";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "./change-password-dialog";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shipments", label: "Envíos", icon: Package },
  { href: "/routes", label: "Rutas", icon: RouteIcon },
  { href: "/drivers", label: "Drivers", icon: Users },
  { href: "/lockers", label: "Casilleros", icon: Archive },
  { href: "/customers", label: "Clientes", icon: Contact },
  { href: "/intake", label: "Recepción", icon: PackageCheck },
  { href: "/carriers", label: "Transportistas", icon: Plane },
  { href: "/pricing", label: "Zonas y tarifas", icon: DollarSign },
  { href: "/payments", label: "Pagos", icon: CreditCard },
  { href: "/billing", label: "Facturación", icon: Receipt },
  { href: "/notifications", label: "Notificaciones", icon: Bell },
  {
    href: "/team",
    label: "Equipo",
    icon: UserCog,
    roles: ["OWNER", "ADMIN"],
  },
  // El backend restringe `GET /audit` a OWNER/ADMIN; el NAV refleja lo mismo
  // para no ofrecer una pantalla que responderá 403.
  {
    href: "/audit",
    label: "Auditoría",
    icon: ScrollText,
    roles: ["OWNER", "ADMIN"],
  },
  { href: "/integrations", label: "Integraciones", icon: KeyRound },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

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

  if (!ready) return null;

  return (
    <div className="flex flex-1 min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/5 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
            <Truck className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-wide">Ruteo</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {NAV.filter(
            (item) => !item.roles || item.roles.includes(session!.role),
          ).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                pathname.startsWith(href)
                  ? "glass-active text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-xs">
          <p className="truncate font-medium">
            {session?.name || session?.email}
          </p>
          <p className="truncate text-sidebar-foreground/60">
            {session ? ROLE_LABELS[session.role] : ""} · {session?.slug}
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
      <main className="panel-surface flex-1 overflow-x-auto p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
