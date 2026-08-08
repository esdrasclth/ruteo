"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api, ApiError, AuditLog, Paginated } from "@/lib/api";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  ROLE_LABELS,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TODOS = "TODOS";
const PAGE_SIZE = 20;

const ACCIONES = Object.keys(AUDIT_ACTION_LABELS);
const ENTIDADES = Object.keys(AUDIT_ENTITY_LABELS);

const fmtDateTime = (v: string) => new Date(v).toLocaleString("es-HN");

// Lleva de la entrada de bitácora al objeto que se tocó. Solo los tipos con
// pantalla propia son navegables; el resto se queda como texto para no ofrecer
// un enlace que no lleva a ningún lado.
function hrefDeEntidad(entityType: string, entityId: string | null) {
  if (!entityId) return null;
  switch (entityType) {
    case "shipment":
      return `/shipments/${entityId}`;
    case "payment":
      return `/payments`;
    case "user":
      return `/team`;
    case "subscription":
      return `/billing`;
    case "api_key":
      return `/integrations`;
    default:
      return null;
  }
}

// El backend guarda `metadata` como JSON libre por acción (ej. from/to en un
// cambio de estado). Se aplana a "clave: valor" para leerlo de un vistazo.
function resumenMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "—";
  const partes = Object.entries(metadata)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return partes.length > 0 ? partes.join(" · ") : "—";
}

export default function AuditPage() {
  const [data, setData] = useState<Paginated<AuditLog> | null>(null);
  const [action, setAction] = useState<string>(TODOS);
  const [entityType, setEntityType] = useState<string>(TODOS);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (action !== TODOS) params.set("action", action);
    if (entityType !== TODOS) params.set("entityType", entityType);
    try {
      setData(await api<Paginated<AuditLog>>(`/audit?${params.toString()}`));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando la auditoría",
      );
    }
  }, [action, entityType, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Cambiar un filtro debe devolver a la primera página: si no, se puede quedar
  // en una página que ya no existe con el filtro nuevo.
  function cambiarFiltro(set: (v: string) => void) {
    return (v: string) => {
      set(v);
      setPage(1);
    };
  }

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        description="Registro inmutable de acciones sensibles: quién hizo qué y cuándo."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>
            Bitácora
            {data ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {data.total} registro{data.total === 1 ? "" : "s"}
              </span>
            ) : null}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={action} onValueChange={cambiarFiltro(setAction)}>
              <SelectTrigger className="w-56" aria-label="Filtrar por acción">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas las acciones</SelectItem>
                {ACCIONES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AUDIT_ACTION_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={entityType}
              onValueChange={cambiarFiltro(setEntityType)}
            >
              <SelectTrigger className="w-48" aria-label="Filtrar por entidad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas las entidades</SelectItem>
                {ENTIDADES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {AUDIT_ENTITY_LABELS[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!data ? (
            <Skeleton className="h-24 w-full" />
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Sin registros"
              description="No hay acciones auditadas que coincidan con los filtros seleccionados."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Entidad</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmtDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const etiqueta =
                            AUDIT_ENTITY_LABELS[log.entityType] ??
                            log.entityType;
                          const href = hrefDeEntidad(
                            log.entityType,
                            log.entityId,
                          );
                          const contenido = (
                            <>
                              <Badge variant="secondary">{etiqueta}</Badge>
                              {log.entityId ? (
                                <code
                                  className="ml-1.5 text-xs text-muted-foreground"
                                  title={log.entityId}
                                >
                                  {log.entityId.slice(0, 8)}
                                </code>
                              ) : null}
                            </>
                          );
                          return href ? (
                            <Link
                              href={href}
                              className="inline-flex items-center rounded transition-opacity hover:opacity-70"
                            >
                              {contenido}
                            </Link>
                          ) : (
                            contenido
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {log.actorRole ? (
                          ROLE_LABELS[log.actorRole]
                        ) : (
                          // Sin actor = la acción vino por API key o del sistema.
                          <span className="text-muted-foreground">Sistema</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-96">
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={resumenMetadata(log.metadata)}
                        >
                          {resumenMetadata(log.metadata)}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Página {data.page} de {totalPaginas}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPaginas}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
