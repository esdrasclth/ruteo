"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { ACCION_TEXTO, AuditEntry, platformApi } from "@/lib/platform-api";

function detalle(e: AuditEntry): string | null {
  // Un "cambió el plan" que no dice de qué a qué obliga a abrir la base para
  // entenderlo, que es justo lo que este historial existe para evitar.
  if (e.action === "tenant.plan_changed") {
    return `${e.before?.plan ?? "?"} → ${e.after?.plan ?? "?"}`;
  }
  if (e.action.startsWith("tenant.module_")) {
    return String(e.after?.module ?? "");
  }
  return null;
}

export function PlatformAudit({
  tenantId,
  titulo = "Historial",
}: {
  tenantId?: string;
  titulo?: string;
}) {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformApi<AuditEntry[]>(
      `/audit${tenantId ? `?tenantId=${tenantId}` : ""}`,
    )
      .then(setItems)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "No se pudo cargar"),
      );
  }, [tenantId]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div>
      <p className="text-sm font-medium text-primary">{titulo}</p>
      {items?.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Todavía no hay movimientos registrados.
        </p>
      ) : null}
      <ol className="mt-3 flex flex-col">
        {items?.map((e, i) => (
          <li key={e.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1.5">
              <span className="size-2 shrink-0 rounded-full bg-primary/40" />
              {i < items.length - 1 ? (
                <span className="w-px flex-1 bg-primary/12" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <p className="text-sm text-foreground">
                {ACCION_TEXTO[e.action] ?? e.action}
                {detalle(e) ? (
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    {detalle(e)}
                  </span>
                ) : null}
                {!tenantId && e.targetLabel ? (
                  <span className="ml-1.5 text-muted-foreground">
                    · {e.targetLabel}
                  </span>
                ) : null}
              </p>
              {e.reason ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  “{e.reason}”
                </p>
              ) : null}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {e.adminEmail} ·{" "}
                {new Date(e.createdAt).toLocaleString("es-HN")}
                {e.ip ? ` · ${e.ip}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
