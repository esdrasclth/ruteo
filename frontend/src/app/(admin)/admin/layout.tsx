"use client";

import { ReactNode, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Search,
  ShieldAlert,
  UserCog,
} from "lucide-react";
import {
  clearPlatformSession,
} from "@/lib/platform-api";
import { usePlatformSesion } from "@/lib/use-sesion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Empresas", icon: Building2 },
  { href: "/admin/audit", label: "Historial", icon: ScrollText },
  { href: "/admin/admins", label: "Superadmins", icon: UserCog },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // La pantalla de acceso queda fuera del guardado de sesión, o entrar sería
  // imposible: el layout la mandaría al login en bucle.
  const esLogin = pathname === "/admin/login";

  // La sesión es una fuente externa a la que este componente se suscribe, así
  // que entrar desde /admin/login la ve en el acto sin releerla a mano en cada
  // cambio de ruta. Era eso lo que arreglaba el efecto de antes —el layout ya
  // estaba montado con `null` y rebotaba al login en bucle—, y ahora sale de
  // cómo se lee el dato, no de repetir la lectura. Mismo patrón que
  // `(panel)/layout.tsx`.
  const { sesion: session, resuelto: comprobado } = usePlatformSesion();

  useEffect(() => {
    if (esLogin || !comprobado) return;
    if (!session) router.replace("/admin/login");
  }, [router, esLogin, comprobado, session]);

  if (esLogin) return <>{children}</>;
  if (!comprobado || !session) return null;

  function salir() {
    clearPlatformSession();
    router.replace("/admin/login");
  }

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/5 bg-sidebar text-sidebar-foreground">
        <div className="px-4 py-5">
          <Image
            src="/logo-negativo.svg"
            alt="Ruteo"
            width={120}
            height={32}
            priority
            className="h-7 w-auto"
          />
          {/* Distintivo permanente: quien esté aquí tiene que saber en todo
              momento que no está en el panel de una empresa. */}
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
            <ShieldAlert className="size-3" />
            Plataforma
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const activo =
              href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                  activo
                    ? "glass-active text-sidebar-foreground"
                    : "text-sidebar-foreground/65 hover:bg-white/5 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3 text-xs">
          <p className="truncate font-medium">{session.email}</p>
          <p className="text-sidebar-foreground/60">Superadmin</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={salir}
            className="mt-1 w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-4" />
            Salir
          </Button>
          <p className="mt-3 border-t border-sidebar-border pt-3 text-[10px] leading-tight text-sidebar-foreground/40">
            Desarrollado por{" "}
            <a
              href="https://www.brandsofts.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
            >
              Brandsofts
            </a>
          </p>
        </div>
      </aside>

      <div className="panel-surface flex min-w-0 flex-1 flex-col">
        {/* El buscador vive en la cabecera y no en una pantalla aparte: la
            pregunta "de que empresa es esta guia" llega mientras estas en
            cualquier sitio del panel. */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-white/70 px-6 backdrop-blur-md lg:px-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q");
              if (String(q ?? "").trim().length >= 3) {
                router.push(`/admin/buscar?q=${encodeURIComponent(String(q))}`);
              }
            }}
            className="w-full max-w-md"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                placeholder="Guia, empresa, cliente o correo…"
                className="h-9 w-full rounded-xl border border-border/80 bg-white/80 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/25 focus-visible:border-primary/40"
              />
            </div>
          </form>
        </header>

        <main className="min-w-0 flex-1 overflow-x-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
