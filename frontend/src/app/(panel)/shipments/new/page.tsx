"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError, Shipment, ShipmentType } from "@/lib/api";
import { TYPE_LABELS } from "@/lib/shipment-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function NewShipmentPage() {
  const router = useRouter();
  const [type, setType] = useState<ShipmentType>("LOCAL");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    recipientName: "",
    recipientPhone: "",
    originLabel: "",
    destinationLabel: "",
    destinationLat: "",
    destinationLng: "",
    weightKg: "",
    declaredValue: "",
    codAmount: "",
    currency: "HNL",
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const str = (v: string) => (v.trim() === "" ? undefined : v.trim());
    const body = {
      type,
      recipientName: form.recipientName.trim(),
      recipientPhone: str(form.recipientPhone),
      originLabel: str(form.originLabel),
      destinationLabel: str(form.destinationLabel),
      destinationLat: num(form.destinationLat),
      destinationLng: num(form.destinationLng),
      weightKg: num(form.weightKg),
      declaredValue: num(form.declaredValue),
      codAmount: num(form.codAmount),
      currency: form.currency.trim() || undefined,
      ...(type === "INTERNATIONAL"
        ? { originCountry: "US", destinationCountry: "HN" }
        : {}),
    };
    try {
      const shipment = await api<Shipment>("/shipments", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "idempotency-key": crypto.randomUUID() },
      });
      toast.success(`Envío creado: ${shipment.trackingNumber}`);
      router.replace(`/shipments/${shipment.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear el envío",
      );
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">Nuevo envío</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del envío</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as ShipmentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as ShipmentType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Moneda</Label>
              <Input
                id="currency"
                maxLength={3}
                value={form.currency}
                onChange={set("currency")}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="recipientName">Destinatario *</Label>
              <Input
                id="recipientName"
                required
                value={form.recipientName}
                onChange={set("recipientName")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recipientPhone">Teléfono</Label>
              <Input
                id="recipientPhone"
                placeholder="+504..."
                value={form.recipientPhone}
                onChange={set("recipientPhone")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="originLabel">Origen</Label>
              <Input
                id="originLabel"
                placeholder={
                  type === "INTERNATIONAL" ? "Bodega Miami, FL" : "Sucursal"
                }
                value={form.originLabel}
                onChange={set("originLabel")}
              />
            </div>
            <div className="sm:col-span-2">
              <AddressSearch
                id="destinationLabel"
                label="Destino"
                placeholder="Col. Kennedy, Tegucigalpa"
                value={form.destinationLabel}
                onChange={(v) =>
                  setForm((f) => ({ ...f, destinationLabel: v }))
                }
                onPick={(r) =>
                  setForm((f) => ({
                    ...f,
                    destinationLabel: r.shortLabel,
                    destinationLat: String(r.lat),
                    destinationLng: String(r.lng),
                  }))
                }
                hint="Al elegir una sugerencia se rellenan las coordenadas solas."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="destinationLat">Latitud destino</Label>
              <Input
                id="destinationLat"
                type="number"
                step="any"
                value={form.destinationLat}
                onChange={set("destinationLat")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="destinationLng">Longitud destino</Label>
              <Input
                id="destinationLng"
                type="number"
                step="any"
                value={form.destinationLng}
                onChange={set("destinationLng")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="weightKg">Peso (kg)</Label>
              <Input
                id="weightKg"
                type="number"
                step="any"
                min="0"
                value={form.weightKg}
                onChange={set("weightKg")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="declaredValue">Valor declarado</Label>
              <Input
                id="declaredValue"
                type="number"
                step="any"
                min="0"
                value={form.declaredValue}
                onChange={set("declaredValue")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="codAmount">Monto COD</Label>
              <Input
                id="codAmount"
                type="number"
                step="any"
                min="0"
                value={form.codAmount}
                onChange={set("codAmount")}
              />
            </div>
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creando…" : "Crear envío"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
