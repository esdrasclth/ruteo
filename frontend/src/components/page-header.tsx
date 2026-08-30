import { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Breadcrumb {
  label: string;
  href?: string;
}

// Cabecera única para todas las pantallas del panel: misma jerarquía
// tipográfica, mismo espaciado y las acciones siempre en el mismo sitio.
// Antes cada página resolvía esto por su cuenta y no coincidían entre sí.
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Ruta de navegación">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? (
                  <ChevronRight className="size-3 opacity-50" aria-hidden />
                ) : null}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="rounded transition-colors hover:text-primary"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground/70">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p
              className="max-w-2xl text-sm text-muted-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
