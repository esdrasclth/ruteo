"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Customer,
  CustomerAddress,
  DeliveryMode,
  DELIVERY_MODE_LABELS,
  Shipment,
  ShipmentType,
  Warehouse,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
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
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("HOME");
  const [deliveryWarehouseId, setDeliveryWarehouseId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [addressId, setAddressId] = useState("");
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

  // Clientes y sucursales, cada uno con su clave: las comparten con las
  // pantallas de Clientes y de Bodegas, así que venir de cualquiera de ellas a
  // dar de alta un envío no vuelve a pedirlas.
  //
  // Las sucursales se filtran por `allowsPickup`: ofrecer una bodega de tránsito
  // como punto de retiro manda al cliente a un portón donde no hay mostrador, y
  // el backend lo rechaza igual.
  const { datos: datosClientes } = useApi<Customer[]>("/customers", {
    silencioso: true,
  });
  const { datos: bodegas } = useApi<Warehouse[]>("/warehouses", {
    silencioso: true,
  });

  const clientes = datosClientes ?? [];
  const sucursales = bodegas?.filter((w) => w.allowsPickup) ?? [];

  // Las direcciones dependen del cliente elegido: sin cliente no hay clave y no
  // se pide nada, y al cambiarlo la clave cambia sola. Es lo que hacía el
  // efecto, sin el `setDirecciones([])` de limpieza.
  const { datos: datosDirecciones } = useApi<CustomerAddress[]>(
    customerId ? `/customers/${customerId}/addresses` : null,
    { silencioso: true },
  );
  const direcciones = datosDirecciones ?? [];

  /**
   * Al elegir una dirección guardada se rellena el destino visible.
   *
   * Se copia al formulario en vez de dejarlo en blanco para que el usuario VEA
   * a dónde va a ir el envío antes de crearlo, y pueda afinarlo: lo que escriba
   * manda sobre la dirección, porque está corrigiendo este envío concreto y no
   * la ficha del cliente.
   */
  function onElegirDireccion(id: string) {
    setAddressId(id);
    const elegida = direcciones.find((d) => d.id === id);
    if (!elegida) return;
    setForm((f) => ({
      ...f,
      destinationLabel: [
        elegida.street,
        elegida.neighborhood,
        elegida.municipality,
        elegida.department,
      ]
        .filter(Boolean)
        .join(", "),
      destinationLat: elegida.lat != null ? String(elegida.lat) : "",
      destinationLng: elegida.lng != null ? String(elegida.lng) : "",
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const str = (v: string) => (v.trim() === "" ? undefined : v.trim());
    const body = {
      type,
      deliveryMode,
      ...(deliveryMode === "BRANCH" ? { deliveryWarehouseId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(addressId ? { destinationAddressId: addressId } : {}),
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
            {/* Modo de entrega: se elige AQUÍ y no al descargar, porque es lo
                que decide en qué montón va el bulto cuando llega a bodega. */}
            <div className="grid gap-2">
              <Label>Modo de entrega</Label>
              <Select
                value={deliveryMode}
                onValueChange={(v) => {
                  setDeliveryMode(v as DeliveryMode);
                  // Al salir de «sucursal» se limpia la bodega elegida: el
                  // backend rechaza un envío a domicilio que la lleve puesta, y
                  // dejarla colgada daría un error que la pantalla no explica.
                  if (v !== "BRANCH") setDeliveryWarehouseId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DELIVERY_MODE_LABELS) as DeliveryMode[]).map(
                    (m) => (
                      <SelectItem key={m} value={m}>
                        {DELIVERY_MODE_LABELS[m]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            {deliveryMode === "BRANCH" && (
              <div className="grid gap-2">
                <Label>Sucursal de retiro *</Label>
                <Select
                  value={deliveryWarehouseId}
                  onValueChange={setDeliveryWarehouseId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Elige la sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {sucursales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Sólo se ofrecen las que atienden mostrador. Si no hay
                    ninguna, decirlo aquí evita que el usuario busque el fallo
                    en el formulario. */}
                {sucursales.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ninguna bodega tiene activado el retiro de clientes.
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-2 sm:col-span-2">
              <Label>Cliente</Label>
              <Select
                value={customerId}
                onValueChange={(v) => {
                  setCustomerId(v);
                  setAddressId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin cliente asociado" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Las direcciones cuelgan del cliente, así que sin cliente elegido
                no hay ninguna que ofrecer. */}
            {customerId && direcciones.length > 0 && (
              <div className="grid gap-2 sm:col-span-2">
                <Label>Dirección guardada</Label>
                <Select value={addressId} onValueChange={onElegirDireccion}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escribir el destino a mano" />
                  </SelectTrigger>
                  <SelectContent>
                    {direcciones.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label}
                        {d.isDefault ? " (por defecto)" : ""} — {d.municipality}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  El envío guarda una copia: corregir la dirección después no
                  cambia a dónde se entregó éste.
                </p>
              </div>
            )}
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
