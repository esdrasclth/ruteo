"use client";

import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, FileDown } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  api,
  API_URL,
  ApiError,
  CustomsRecord,
  getSession,
  ShipmentDetail,
  ShipmentStatus,
} from "@/lib/api";
import {
  STATUS_LABELS,
  TYPE_LABELS,
  allowedNextStatuses,
  statusBadgeClass,
} from "@/lib/shipment-status";
import {
  CUSTOMS_STATUS_LABELS,
  customsStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function CustomsCard({
  shipmentId,
  declaredValue,
}: {
  shipmentId: string;
  declaredValue: string | null;
}) {
  const [record, setRecord] = useState<CustomsRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    declaredValue: declaredValue ?? "",
    dutyRate: "0.15",
    taxRate: "0.15",
    handlingFee: "10",
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      setRecord(await api<CustomsRecord>(`/customs/${shipmentId}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setRecord(null);
      else
        toast.error(
          err instanceof ApiError ? err.message : "Error cargando aduana",
        );
    } finally {
      setLoaded(true);
    }
  }, [shipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!record) return;
    setForm((f) => ({
      ...f,
      declaredValue: record.declaredValue ?? f.declaredValue,
      notes: record.notes ?? "",
    }));
  }, [record]);

  async function onUpsert(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    try {
      await api("/customs", {
        method: "POST",
        body: JSON.stringify({
          shipmentId,
          declaredValue: num(form.declaredValue),
          dutyRate: num(form.dutyRate),
          taxRate: num(form.taxRate),
          handlingFee: num(form.handlingFee),
          notes: form.notes.trim() || undefined,
        }),
      });
      toast.success("Cálculo de aduana guardado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo guardar aduana",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    try {
      await api(`/customs/${shipmentId}/clear`, { method: "PATCH" });
      toast.success("Envío liberado de aduana");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo liberar",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Aduana</CardTitle>
          {record ? (
            <Badge className={customsStatusBadgeClass(record.status)}>
              {CUSTOMS_STATUS_LABELS[record.status]}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {record ? (
          <div className="grid gap-4 sm:grid-cols-5">
            <Field
              label="Valor declarado"
              value={
                record.declaredValue
                  ? `${record.declaredValue} ${record.currency}`
                  : "—"
              }
            />
            <Field
              label="Arancel"
              value={
                record.dutyAmount
                  ? `${record.dutyAmount} ${record.currency}`
                  : "—"
              }
            />
            <Field
              label="ISV"
              value={
                record.taxAmount ? `${record.taxAmount} ${record.currency}` : "—"
              }
            />
            <Field
              label="Manejo"
              value={
                record.handlingFee
                  ? `${record.handlingFee} ${record.currency}`
                  : "—"
              }
            />
            <Field
              label="Total cargos"
              value={
                record.totalCharges
                  ? `${record.totalCharges} ${record.currency}`
                  : "—"
              }
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin registro de aduana. Calcula los cargos para este envío.
          </p>
        )}
        {record?.notes ? (
          <p className="text-sm text-muted-foreground">{record.notes}</p>
        ) : null}
        {record?.clearedAt ? (
          <p className="text-xs text-muted-foreground">
            Liberado el {new Date(record.clearedAt).toLocaleString("es-HN")}
          </p>
        ) : (
          <form
            onSubmit={onUpsert}
            className="flex flex-wrap items-end gap-3 border-t pt-4"
          >
            <div className="grid gap-1">
              <Label htmlFor="cDeclared" className="text-xs">
                Valor (USD)
              </Label>
              <Input
                id="cDeclared"
                type="number"
                step="any"
                min="0"
                className="w-28"
                value={form.declaredValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, declaredValue: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cDuty" className="text-xs">
                Arancel (0-1)
              </Label>
              <Input
                id="cDuty"
                type="number"
                step="any"
                min="0"
                max="1"
                className="w-24"
                value={form.dutyRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dutyRate: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cTax" className="text-xs">
                ISV (0-1)
              </Label>
              <Input
                id="cTax"
                type="number"
                step="any"
                min="0"
                max="1"
                className="w-24"
                value={form.taxRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, taxRate: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cHandling" className="text-xs">
                Manejo (USD)
              </Label>
              <Input
                id="cHandling"
                type="number"
                step="any"
                min="0"
                className="w-24"
                value={form.handlingFee}
                onChange={(e) =>
                  setForm((f) => ({ ...f, handlingFee: e.target.value }))
                }
              />
            </div>
            <div className="grid min-w-40 flex-1 gap-1">
              <Label htmlFor="cNotes" className="text-xs">
                Notas
              </Label>
              <Input
                id="cNotes"
                maxLength={500}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" disabled={busy}>
                {record ? "Recalcular" : "Calcular"}
              </Button>
              {record ? (
                <Button type="button" onClick={onClear} disabled={busy}>
                  Liberar
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [nextStatus, setNextStatus] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setShipment(await api<ShipmentDetail>(`/shipments/${id}`));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando el envío",
      );
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onTransition() {
    if (!shipment || !nextStatus) return;
    setSaving(true);
    try {
      await api(`/shipments/${shipment.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus,
          ...(note.trim() ? { description: note.trim() } : {}),
        }),
      });
      toast.success(
        `Estado actualizado a ${STATUS_LABELS[nextStatus as ShipmentStatus]}`,
      );
      setNextStatus("");
      setNote("");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cambiar el estado",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onLabel() {
    const session = getSession();
    if (!shipment || !session) return;
    const res = await fetch(`${API_URL}/shipments/${shipment.id}/label`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!res.ok) {
      toast.error("No se pudo generar la etiqueta");
      return;
    }
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  }

  if (!shipment) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const nexts = allowedNextStatuses(shipment.type, shipment.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/shipments">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-mono text-xl font-semibold">
              {shipment.trackingNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              {TYPE_LABELS[shipment.type]} ·{" "}
              {new Date(shipment.createdAt).toLocaleString("es-HN")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusBadgeClass(shipment.status)}>
            {STATUS_LABELS[shipment.status]}
          </Badge>
          <Button variant="outline" onClick={onLabel}>
            <FileDown className="size-4" />
            Etiqueta
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/track/${shipment.trackingNumber}`}
              target="_blank"
            >
              <ExternalLink className="size-4" />
              Rastreo público
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Datos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Destinatario" value={shipment.recipientName} />
            <Field label="Teléfono" value={shipment.recipientPhone ?? "—"} />
            <Field
              label="Origen"
              value={
                [shipment.originLabel, shipment.originCountry]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            <Field
              label="Destino"
              value={
                [shipment.destinationLabel, shipment.destinationCountry]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            <Field
              label="Peso"
              value={shipment.weightKg ? `${shipment.weightKg} kg` : "—"}
            />
            <Field
              label="Valor declarado"
              value={
                shipment.declaredValue
                  ? `${shipment.declaredValue} ${shipment.currency}`
                  : "—"
              }
            />
            <Field
              label="COD"
              value={
                shipment.codAmount
                  ? `${shipment.codAmount} ${shipment.currency}`
                  : "—"
              }
            />
            <Field
              label="Tracking del carrier"
              value={shipment.carrierTrackingNumber ?? "—"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cambiar estado</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {nexts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Estado terminal: no hay transiciones disponibles.
              </p>
            ) : (
              <>
                <Select value={nextStatus} onValueChange={setNextStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nuevo estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {nexts.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid gap-2">
                  <Label htmlFor="note">Nota (opcional)</Label>
                  <Textarea
                    id="note"
                    maxLength={280}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <Button
                  onClick={onTransition}
                  disabled={!nextStatus || saving}
                >
                  {saving ? "Guardando…" : "Aplicar"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {shipment.type === "INTERNATIONAL" ? (
        <CustomsCard
          shipmentId={shipment.id}
          declaredValue={shipment.declaredValue}
        />
      ) : null}

      {shipment.legs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tramos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {shipment.legs.map((leg) => (
              <div
                key={leg.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
              >
                <Badge variant="outline">#{leg.sequence}</Badge>
                <span className="font-medium">{leg.mode}</span>
                <span className="text-muted-foreground">
                  {leg.originLabel ?? "—"} → {leg.destinationLabel ?? "—"}
                </span>
                {leg.eta ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    ETA: {new Date(leg.eta).toLocaleString("es-HN")}
                  </span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative ml-3 border-l border-border">
            {[...shipment.events].reverse().map((ev) => (
              <li key={ev.id} className="mb-5 ml-5">
                <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusBadgeClass(ev.status)}>
                    {STATUS_LABELS[ev.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ev.occurredAt).toLocaleString("es-HN")}
                  </span>
                </div>
                {ev.description ? (
                  <p className="mt-1 text-sm">{ev.description}</p>
                ) : null}
                {ev.locationLabel ? (
                  <p className="text-xs text-muted-foreground">
                    {ev.locationLabel}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
