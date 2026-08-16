"use client";

import { FormEvent, useCallback, useState } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, Rate, RateQuote, Zone } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { useConfirmar } from "@/components/confirmar";
import { PageHeader } from "@/components/page-header";
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
import { AddressSearch } from "@/components/address-search";
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

const EMPTY_ZONE = {
  name: "",
  code: "",
  description: "",
  centerLat: "",
  centerLng: "",
  radiusKm: "",
};

const EMPTY_RATE = {
  name: "",
  zoneId: "NONE",
  baseFee: "50",
  perKg: "15",
  perKm: "8",
  minCharge: "60",
};

const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

export default function PricingPage() {
  const confirmar = useConfirmar();
  const [busy, setBusy] = useState(false);

  const [zoneOpen, setZoneOpen] = useState(false);
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE);
  // Solo alimenta al buscador: la zona guarda coordenadas, no la dirección.
  const [zoneCentro, setZoneCentro] = useState("");

  const [rateOpen, setRateOpen] = useState(false);
  const [rateForm, setRateForm] = useState(EMPTY_RATE);

  const [quoteForm, setQuoteForm] = useState({
    weightKg: "1",
    distanceKm: "",
    zoneId: "NONE",
  });
  const [quote, setQuote] = useState<RateQuote | null>(null);

  const mensajeDeError = "Error cargando zonas y tarifas";
  const consultaZonas = useApi<Zone[]>("/zones", { mensajeDeError });
  const consultaTarifas = useApi<Rate[]>("/rates", { mensajeDeError });

  const zones = consultaZonas.datos ?? null;
  const rates = consultaTarifas.datos ?? null;

  const { recargar: recargarZonas } = consultaZonas;
  const { recargar: recargarTarifas } = consultaTarifas;
  const load = useCallback(async () => {
    await Promise.all([recargarZonas(), recargarTarifas()]);
  }, [recargarZonas, recargarTarifas]);

  const zoneName = (id: string | null) =>
    id ? (zones?.find((z) => z.id === id)?.name ?? "—") : "General";

  async function onCreateZone(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/zones", {
        method: "POST",
        body: JSON.stringify({
          name: zoneForm.name.trim(),
          code: zoneForm.code.trim(),
          description: zoneForm.description.trim() || undefined,
          centerLat: num(zoneForm.centerLat),
          centerLng: num(zoneForm.centerLng),
          radiusKm: num(zoneForm.radiusKm),
        }),
      });
      toast.success("Zona creada");
      setZoneOpen(false);
      setZoneForm(EMPTY_ZONE);
      setZoneCentro("");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear la zona",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCreateRate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/rates", {
        method: "POST",
        body: JSON.stringify({
          name: rateForm.name.trim(),
          zoneId: rateForm.zoneId === "NONE" ? undefined : rateForm.zoneId,
          baseFee: num(rateForm.baseFee),
          perKg: num(rateForm.perKg),
          perKm: num(rateForm.perKm),
          minCharge: num(rateForm.minCharge),
        }),
      });
      toast.success("Tarifa creada");
      setRateOpen(false);
      setRateForm(EMPTY_RATE);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear la tarifa",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(kind: "zones" | "rates", id: string, active: boolean) {
    setBusy(true);
    try {
      await api(`/${kind}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !active }),
      });
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "zones" | "rates", id: string, label: string) {
    if (
      !(await confirmar({
        titulo: `¿Eliminar ${label}?`,
        accion: "Eliminar",
        peligro: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api(`/${kind}/${id}`, { method: "DELETE" });
      toast.success("Eliminado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo eliminar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onQuote(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setQuote(null);
    try {
      setQuote(
        await api<RateQuote>("/rates/quote", {
          method: "POST",
          body: JSON.stringify({
            weightKg: Number(quoteForm.weightKg),
            distanceKm: num(quoteForm.distanceKm),
            zoneId: quoteForm.zoneId === "NONE" ? undefined : quoteForm.zoneId,
          }),
        }),
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cotizar",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Zonas y tarifas"
        description="Cobertura, precios por zona y cotizador"
      />

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Zonas ({zones?.length ?? "…"})
            </CardTitle>
            <Button size="sm" onClick={() => setZoneOpen(true)}>
              <Plus className="size-4" />
              Nueva zona
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!zones ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : zones.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Sin zonas. Crea zonas de cobertura para asignar tarifas y drivers.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Centro</TableHead>
                  <TableHead className="text-right">Radio (km)</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell className="font-medium">{z.name}</TableCell>
                    <TableCell className="font-mono">
                      {z.code}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {z.centerLat != null && z.centerLng != null
                        ? `${z.centerLat}, ${z.centerLng}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {z.radiusKm ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          z.active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {z.active ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => toggleActive("zones", z.id, z.active)}
                        >
                          {z.active ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => remove("zones", z.id, `la zona ${z.name}`)}
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

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Tarifas ({rates?.length ?? "…"})
            </CardTitle>
            <Button size="sm" onClick={() => setRateOpen(true)}>
              <Plus className="size-4" />
              Nueva tarifa
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!rates ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : rates.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Sin tarifas. Crea una tarifa general o por zona:
              max(mínimo, base + kg·peso + km·distancia).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Por kg</TableHead>
                  <TableHead className="text-right">Por km</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {zoneName(r.zoneId)}
                    </TableCell>
                    <TableCell className="text-right">{r.baseFee}</TableCell>
                    <TableCell className="text-right">{r.perKg}</TableCell>
                    <TableCell className="text-right">{r.perKm}</TableCell>
                    <TableCell className="text-right">
                      {r.minCharge} {r.currency}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          r.active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {r.active ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => toggleActive("rates", r.id, r.active)}
                        >
                          {r.active ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            remove("rates", r.id, `la tarifa ${r.name}`)
                          }
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cotizador</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={onQuote} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label htmlFor="qWeight" className="text-xs">
                Peso (kg) *
              </Label>
              <Input
                id="qWeight"
                type="number"
                step="any"
                min="0.01"
                required
                className="w-28"
                value={quoteForm.weightKg}
                onChange={(e) =>
                  setQuoteForm((f) => ({ ...f, weightKg: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="qDistance" className="text-xs">
                Distancia (km)
              </Label>
              <Input
                id="qDistance"
                type="number"
                step="any"
                min="0"
                className="w-28"
                value={quoteForm.distanceKm}
                onChange={(e) =>
                  setQuoteForm((f) => ({ ...f, distanceKm: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Zona</Label>
              <Select
                value={quoteForm.zoneId}
                onValueChange={(v) =>
                  setQuoteForm((f) => ({ ...f, zoneId: v }))
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">General (sin zona)</SelectItem>
                  {(zones ?? []).map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy}>
              <Calculator className="size-4" />
              Cotizar
            </Button>
          </form>
          {quote ? (
            <div className="flex flex-wrap items-center gap-6 rounded-md border p-4">
              <div>
                <p className="text-xs text-muted-foreground">Base</p>
                <p className="text-sm">{quote.breakdown.baseFee}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Por peso</p>
                <p className="text-sm">{quote.breakdown.weightCharge}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Por distancia</p>
                <p className="text-sm">{quote.breakdown.distanceCharge}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mínimo</p>
                <p className="text-sm">{quote.breakdown.minCharge}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold">
                  {quote.total} {quote.currency}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={zoneOpen} onOpenChange={setZoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva zona</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreateZone} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="zName">Nombre *</Label>
                <Input
                  id="zName"
                  required
                  placeholder="Tegucigalpa Centro"
                  value={zoneForm.name}
                  onChange={(e) =>
                    setZoneForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="zCode">Código *</Label>
                <Input
                  id="zCode"
                  required
                  placeholder="TGU-C"
                  value={zoneForm.code}
                  onChange={(e) =>
                    setZoneForm((f) => ({ ...f, code: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="zDesc">Descripción</Label>
              <Input
                id="zDesc"
                value={zoneForm.description}
                onChange={(e) =>
                  setZoneForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <AddressSearch
              id="zCentro"
              label="Centro de la zona"
              placeholder="Busca un punto: un bulevar, un centro comercial…"
              value={zoneCentro}
              onChange={setZoneCentro}
              onPick={(r) =>
                setZoneForm((f) => ({
                  ...f,
                  centerLat: String(r.lat),
                  centerLng: String(r.lng),
                }))
              }
              hint="Solo fija las coordenadas del centro; no se guarda como texto."
            />
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="zLat">Lat centro</Label>
                <Input
                  id="zLat"
                  type="number"
                  step="any"
                  placeholder="14.0723"
                  value={zoneForm.centerLat}
                  onChange={(e) =>
                    setZoneForm((f) => ({ ...f, centerLat: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="zLng">Lng centro</Label>
                <Input
                  id="zLng"
                  type="number"
                  step="any"
                  placeholder="-87.1921"
                  value={zoneForm.centerLng}
                  onChange={(e) =>
                    setZoneForm((f) => ({ ...f, centerLng: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="zRadius">Radio (km)</Label>
                <Input
                  id="zRadius"
                  type="number"
                  step="any"
                  min="0"
                  value={zoneForm.radiusKm}
                  onChange={(e) =>
                    setZoneForm((f) => ({ ...f, radiusKm: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Creando…" : "Crear zona"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva tarifa</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreateRate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rName">Nombre *</Label>
              <Input
                id="rName"
                required
                placeholder="Tarifa urbana estándar"
                value={rateForm.name}
                onChange={(e) =>
                  setRateForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Zona</Label>
              <Select
                value={rateForm.zoneId}
                onValueChange={(v) =>
                  setRateForm((f) => ({ ...f, zoneId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">General (sin zona)</SelectItem>
                  {(zones ?? []).map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rBase">Base</Label>
                <Input
                  id="rBase"
                  type="number"
                  step="any"
                  min="0"
                  value={rateForm.baseFee}
                  onChange={(e) =>
                    setRateForm((f) => ({ ...f, baseFee: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rKg">Por kg</Label>
                <Input
                  id="rKg"
                  type="number"
                  step="any"
                  min="0"
                  value={rateForm.perKg}
                  onChange={(e) =>
                    setRateForm((f) => ({ ...f, perKg: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rKm">Por km</Label>
                <Input
                  id="rKm"
                  type="number"
                  step="any"
                  min="0"
                  value={rateForm.perKm}
                  onChange={(e) =>
                    setRateForm((f) => ({ ...f, perKm: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rMin">Mínimo</Label>
                <Input
                  id="rMin"
                  type="number"
                  step="any"
                  min="0"
                  value={rateForm.minCharge}
                  onChange={(e) =>
                    setRateForm((f) => ({ ...f, minCharge: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Creando…" : "Crear tarifa"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
