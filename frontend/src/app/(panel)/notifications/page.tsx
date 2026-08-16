"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bell, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  NotificationChannel,
  NotificationRow,
  NotificationStatus,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_STATUS_LABELS,
  notificationStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

const CHANNELS: NotificationChannel[] = ["SMS", "EMAIL", "PUSH", "WHATSAPP"];
const STATUSES: NotificationStatus[] = ["PENDING", "SENT", "FAILED"];

// Radix Select no admite value="", así que "todos" se representa con un
// centinela que se traduce a undefined al construir el query.
const TODOS = "TODOS";

const fmtDateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString("es-HN") : "—";

const EMPTY_FORM = {
  channel: "EMAIL" as NotificationChannel,
  recipient: "",
  type: "manual",
  title: "",
  body: "",
};

// `useSearchParams` obliga a una frontera Suspense: en producción una página
// estática que lo llame sin ella rompe el build (en desarrollo no se nota).
export default function NotificationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <NotificationsContent />
    </Suspense>
  );
}

function NotificationsContent() {
  const searchParams = useSearchParams();
  // Llega desde el detalle de un envío: "ver los avisos de este envío".
  const shipmentId = searchParams.get("shipmentId");

  const [status, setStatus] = useState<string>(TODOS);
  const [channel, setChannel] = useState<string>(TODOS);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // La consulta se arma en el render porque ES la clave de caché.
  const params = new URLSearchParams();
  if (status !== TODOS) params.set("status", status);
  if (channel !== TODOS) params.set("channel", channel);
  if (shipmentId) params.set("shipmentId", shipmentId);
  const qs = params.toString();

  const { datos, recargar: load } = useApi<NotificationRow[]>(
    `/notifications${qs ? `?${qs}` : ""}`,
    {
      mensajeDeError: "Error cargando notificaciones",
      keepPreviousData: true,
    },
  );
  const rows = datos ?? null;

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/notifications", {
        method: "POST",
        body: JSON.stringify({
          channel: form.channel,
          recipient: form.recipient.trim(),
          type: form.type.trim() || "manual",
          ...(form.title.trim() ? { title: form.title.trim() } : {}),
          body: form.body.trim(),
        }),
      });
      toast.success("Notificación enviada");
      setForm(EMPTY_FORM);
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error enviando la notificación",
      );
    } finally {
      setBusy(false);
    }
  }

  const fallidas = rows?.filter((r) => r.status === "FAILED").length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={
          shipmentId
            ? [
                { label: "Envíos", href: "/shipments" },
                { label: "Envío", href: `/shipments/${shipmentId}` },
                { label: "Avisos" },
              ]
            : undefined
        }
        title="Notificaciones"
        description="Historial de avisos enviados a clientes y destinatarios. Los que dispara un cambio de estado se entregan por cola y se reintentan solos."
        actions={
          shipmentId ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/notifications">
                <X className="size-4" />
                Quitar filtro de envío
              </Link>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CardTitle>Historial</CardTitle>
            {fallidas > 0 ? (
              <Badge className="bg-destructive/10 text-destructive">
                {fallidas} fallida{fallidas === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" aria-label="Filtrar por estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los estados</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {NOTIFICATION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-44" aria-label="Filtrar por canal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los canales</SelectItem>
                {CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {NOTIFICATION_CHANNEL_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Send className="size-4" />
              Enviar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Sin notificaciones"
              description={
                shipmentId
                  ? "Este envío todavía no ha generado avisos."
                  : "No hay avisos que coincidan con los filtros seleccionados."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead>Envío</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(n.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {NOTIFICATION_CHANNEL_LABELS[n.channel]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{n.recipient}</TableCell>
                    <TableCell className="max-w-96">
                      {n.title ? (
                        <p className="truncate text-sm font-medium">
                          {n.title}
                        </p>
                      ) : null}
                      <p className="truncate text-sm text-muted-foreground">
                        {n.body}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {n.type}
                      </p>
                    </TableCell>
                    <TableCell>
                      {n.shipmentId ? (
                        <Link
                          href={`/shipments/${n.shipmentId}`}
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Ver envío
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={notificationStatusBadgeClass(n.status)}>
                        {NOTIFICATION_STATUS_LABELS[n.status]}
                      </Badge>
                      {n.error ? (
                        <p
                          className="mt-1 max-w-48 truncate text-xs text-destructive"
                          title={n.error}
                        >
                          {n.error}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar notificación</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSend} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="notif-channel">Canal</Label>
                <Select
                  value={form.channel}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      channel: v as NotificationChannel,
                    }))
                  }
                >
                  <SelectTrigger id="notif-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {NOTIFICATION_CHANNEL_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notif-type">Tipo</Label>
                <Input
                  id="notif-type"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  placeholder="manual"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-recipient">Destinatario</Label>
              <Input
                id="notif-recipient"
                value={form.recipient}
                onChange={(e) =>
                  setForm((f) => ({ ...f, recipient: e.target.value }))
                }
                placeholder="cliente@correo.com o +50499998888"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-title">Título (opcional)</Label>
              <Input
                id="notif-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-body">Mensaje</Label>
              <Textarea
                id="notif-body"
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
                rows={3}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Enviar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
