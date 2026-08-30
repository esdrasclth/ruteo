import { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Alternativa compacta a una tabla para pantallas estrechas. */
export function MobileList({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn("divide-y divide-border md:hidden", className)}
    >
      {children}
    </ul>
  );
}

export function MobileListCard({
  href,
  label,
  children,
  className,
}: {
  href?: string;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const content = (
    <div className="flex min-h-20 items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">{children}</div>
      {href ? (
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      ) : null}
    </div>
  );

  return (
    <li className={className}>
      {href ? (
        <Link
          href={href}
          aria-label={label}
          className="block rounded-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

export function MobileListMeta({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="sr-only">{label}: </span>
      {children}
    </span>
  );
}
