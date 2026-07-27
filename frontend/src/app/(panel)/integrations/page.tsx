"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  ApiKey,
  ApiKeyCreated,
  WebhookEndpoint,
  WebhookEndpointCreated,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("es-HN") : "—";

function SecretReveal({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Guárdalo ahora: no se volverá a mostrar.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onCopy}
          aria-label="Copiar"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);

  const [whOpen, setWhOpen] = useState(false);
  const [whForm, setWhForm] = useState({
    url: "",
    events: "shipment.status_changed",
  });
  const [createdWh, setCreatedWh] = useState<WebhookEndpointCreated | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [k, w] = await Promise.all([
        api<ApiKey[]>("/api-keys"),
        api<WebhookEndpoint[]>("/webhooks"),
      ]);
      setKeys(k);
      setWebhooks(w);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando integraciones",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreateKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api<ApiKeyCreated>("/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: keyName.trim() }),
      });
      setCreatedKey(created);
      setKeyName("");
      toast.success("API key creada");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error creando API key",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeKey(k: ApiKey) {
    if (!window.confirm(`¿Revocar la API key "${k.name}"?`)) return;
    setBusy(true);
    try {
      await api(`/api-keys/${k.id}`, { method: "DELETE" });
      toast.success("API key revocada");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error revocando API key",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCreateWebhook(e: FormEvent) {
    e.preventDefault();
    const events = whForm.events
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (events.length === 0) {
      toast.error("Indica al menos un evento");
      return;
    }
    setBusy(true);
    try {
      const created = await api<WebhookEndpointCreated>("/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: whForm.url.trim(), events }),
      });
      setCreatedWh(created);
      setWhForm({ url: "", events: "shipment.status_changed" });
      toast.success("Webhook creado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error creando webhook",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onToggleWebhook(w: WebhookEndpoint) {
    setBusy(true);
    try {
      await api(`/webhooks/${w.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !w.active }),
      });
      toast.success(w.active ? "Webhook desactivado" : "Webhook activado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error actualizando webhook",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteWebhook(w: WebhookEndpoint) {
    if (!window.confirm(`¿Eliminar el webhook ${w.url}?`)) return;
    setBusy(true);
    try {
      await api(`/webhooks/${w.id}`, { method: "DELETE" });
      toast.success("Webhook eliminado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error eliminando webhook",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integraciones</h1>
        <p className="text-sm text-muted-foreground">
          API keys y webhooks para conectar sistemas externos.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>API keys</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setCreatedKey(null);
              setKeyOpen(true);
            }}
          >
            <Plus className="size-4" />
            Nueva API key
          </Button>
        </CardHeader>
        <CardContent>
          {!keys ? (
            <Skeleton className="h-24 w-full" />
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay API keys todavía.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <code className="text-xs">rk_{k.prefix}_••••••••</code>
                    </TableCell>
                    <TableCell>{fmtDate(k.lastUsedAt)}</TableCell>
                    <TableCell>{fmtDate(k.createdAt)}</TableCell>
                    <TableCell>
                      {k.revokedAt ? (
                        <Badge className="bg-destructive/10 text-destructive">
                          Revocada
                        </Badge>
                      ) : (
                        <Badge className="bg-primary/10 text-primary">
                          Activa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!k.revokedAt && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => onRevokeKey(k)}
                          aria-label="Revocar"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Webhooks</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setCreatedWh(null);
              setWhOpen(true);
            }}
          >
            <Plus className="size-4" />
            Nuevo webhook
          </Button>
        </CardHeader>
        <CardContent>
          {!webhooks ? (
            <Skeleton className="h-24 w-full" />
          ) : webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay webhooks todavía.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="max-w-72 truncate font-medium">
                      {w.url}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {w.events.map((ev) => (
                          <Badge key={ev} variant="secondary">
                            {ev}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {w.active ? (
                        <Badge className="bg-primary/10 text-primary">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>{fmtDate(w.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => onToggleWebhook(w)}
                        >
                          {w.active ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => onDeleteWebhook(w)}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva API key</DialogTitle>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-4">
              <SecretReveal
                value={createdKey.key}
                label={`API key "${createdKey.name}"`}
              />
              <DialogFooter>
                <Button onClick={() => setKeyOpen(false)}>Listo</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={onCreateKey} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Nombre</Label>
                <Input
                  id="key-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Integración ERP"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  Crear
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={whOpen} onOpenChange={setWhOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo webhook</DialogTitle>
          </DialogHeader>
          {createdWh ? (
            <div className="space-y-4">
              <SecretReveal
                value={createdWh.secret}
                label="Secreto de firma"
              />
              <DialogFooter>
                <Button onClick={() => setWhOpen(false)}>Listo</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={onCreateWebhook} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wh-url">URL</Label>
                <Input
                  id="wh-url"
                  type="url"
                  value={whForm.url}
                  onChange={(e) =>
                    setWhForm((f) => ({ ...f, url: e.target.value }))
                  }
                  placeholder="https://midominio.com/webhooks/ruteo"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wh-events">Eventos (separados por coma)</Label>
                <Input
                  id="wh-events"
                  value={whForm.events}
                  onChange={(e) =>
                    setWhForm((f) => ({ ...f, events: e.target.value }))
                  }
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  Crear
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
