"use client";

import { FormEvent, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, Carrier, CarrierType } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { CARRIER_TYPE_LABELS } from "@/lib/logistics";
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

const CARRIER_TYPES: CarrierType[] = ["COURIER", "AIRLINE", "OCEAN", "GROUND"];

const EMPTY_FORM = {
  name: "",
  code: "",
  type: "COURIER" as CarrierType,
  trackingUrlTemplate: "",
};

export default function CarriersPage() {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { datos, recargar: load } = useApi<Carrier[]>("/carriers", {
    mensajeDeError: "Error cargando transportistas",
  });
  // `?? null` para no cambiar el resto de la pantalla: antes esto era
  // `T | null` y `useApi` entrega `T | undefined`.
  const carriers = datos ?? null;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const plantilla = form.trackingUrlTemplate.trim();
    if (plantilla && !plantilla.includes("{tracking}")) {
      toast.error("La plantilla debe incluir el marcador {tracking}");
      return;
    }
    setBusy(true);
    try {
      await api("/carriers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          type: form.type,
          ...(plantilla ? { trackingUrlTemplate: plantilla } : {}),
        }),
      });
      toast.success("Transportista creado");
      setForm(EMPTY_FORM);
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error creando transportista",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(c: Carrier) {
    setBusy(true);
    try {
      await api(`/carriers/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !c.active }),
      });
      toast.success(c.active ? "Transportista desactivado" : "Transportista activado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error actualizando",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(c: Carrier) {
    if (!window.confirm(`¿Eliminar el transportista "${c.name}"?`)) return;
    setBusy(true);
    try {
      await api(`/carriers/${c.id}`, { method: "DELETE" });
      toast.success("Transportista eliminado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error eliminando",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transportistas</h1>
        <p className="text-sm text-muted-foreground">
          Couriers, aerolíneas y navieras que mueven los tramos internacionales.
          La plantilla de rastreo genera el enlace externo que ve el cliente.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Catálogo</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Nuevo transportista
          </Button>
        </CardHeader>
        <CardContent>
          {!carriers ? (
            <Skeleton className="h-24 w-full" />
          ) : carriers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay transportistas todavía. Agrega uno para poder asignarlo a
              los tramos de un envío internacional.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Rastreo externo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {carriers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <code className="text-xs">{c.code}</code>
                    </TableCell>
                    <TableCell>{CARRIER_TYPE_LABELS[c.type]}</TableCell>
                    <TableCell className="max-w-72">
                      {c.trackingUrlTemplate ? (
                        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <ExternalLink className="size-3 shrink-0" />
                          <span className="truncate">
                            {c.trackingUrlTemplate}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Sin plantilla
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.active ? (
                        <Badge className="bg-primary/10 text-primary">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => onToggle(c)}
                        >
                          {c.active ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => onDelete(c)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo transportista</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="carrier-name">Nombre</Label>
              <Input
                id="carrier-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="DHL Express"
                maxLength={120}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="carrier-code">Código</Label>
                <Input
                  id="carrier-code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                  placeholder="DHL"
                  maxLength={40}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier-type">Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, type: v as CarrierType }))
                  }
                >
                  <SelectTrigger id="carrier-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARRIER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {CARRIER_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="carrier-url">
                Plantilla de rastreo (opcional)
              </Label>
              <Input
                id="carrier-url"
                value={form.trackingUrlTemplate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    trackingUrlTemplate: e.target.value,
                  }))
                }
                placeholder="https://www.dhl.com/track?id={tracking}"
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground">
                Usa <code>{"{tracking}"}</code> donde va el número de guía del
                transportista.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
