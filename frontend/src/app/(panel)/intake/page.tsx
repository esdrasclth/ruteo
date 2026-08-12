"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Check, PackageCheck, Search } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  IntakeResult,
  Locker,
  LockerPackageWithLocker,
  PackageCategory,
  PackageCondition,
} from "@/lib/api";
import {
  PACKAGE_STATUS_LABELS,
  packageStatusBadgeClass,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FotosDelBulto } from "./fotos-del-bulto";

const EMPTY = {
  externalTracking: "",
  merchant: "",
  description: "",
  weightKg: "",
  declaredValue: "",
  // Las tres o ninguna: con dos de tres no hay volumen que calcular.
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  pieces: "1",
  condition: "GOOD" as PackageCondition,
  category: "" as PackageCategory | "",
};

// Espejo de `DIVISOR_POR_DEFECTO` del backend, solo para PREVISUALIZAR el peso
// cobrable mientras se teclea. El valor que se guarda lo calcula el backend con
// el divisor del tenant, que puede ser otro: esto orienta, no decide.
const DIVISOR_PREVIO = 5000;

const CONDICIONES: { valor: PackageCondition; etiqueta: string }[] = [
  { valor: "GOOD", etiqueta: "Bien" },
  { valor: "DAMAGED", etiqueta: "Dañado" },
  { valor: "WET", etiqueta: "Mojado" },
  { valor: "OPENED", etiqueta: "Abierto" },
];

const CATEGORIAS: { valor: PackageCategory; etiqueta: string }[] = [
  { valor: "ELECTRONICS", etiqueta: "Electrónica" },
  { valor: "CLOTHING", etiqueta: "Ropa" },
  { valor: "FOOTWEAR", etiqueta: "Calzado" },
  { valor: "HOME", etiqueta: "Hogar" },
  { valor: "AUTO_PARTS", etiqueta: "Repuestos" },
  { valor: "COSMETICS", etiqueta: "Cosméticos" },
  { valor: "MEDICINE", etiqueta: "Medicamentos" },
  { valor: "DOCUMENTS", etiqueta: "Documentos" },
  { valor: "OTHER", etiqueta: "Otro" },
];

export default function IntakePage() {
  const [lockers, setLockers] = useState<Locker[] | null>(null);
  const [lockerQuery, setLockerQuery] = useState("");
  const [selected, setSelected] = useState<Locker | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  // Previsualización del peso cobrable. Es solo orientativa: el valor que se
  // guarda lo calcula el backend con el divisor del tenant, que puede diferir.
  const previo = useMemo(() => {
    const l = Number(form.lengthCm);
    const w = Number(form.widthCm);
    const h = Number(form.heightCm);
    if (!(l > 0 && w > 0 && h > 0)) return null;
    const volumetrico = (l * w * h) / DIVISOR_PREVIO;
    const real = Number(form.weightKg) || 0;
    const cobrable = Math.max(real, volumetrico);
    return {
      volumetrico: volumetrico.toFixed(3),
      cobrable: cobrable.toFixed(3),
      mandaVolumen: volumetrico > real,
    };
  }, [form.lengthCm, form.widthCm, form.heightCm, form.weightKg]);

  const [pending, setPending] = useState<LockerPackageWithLocker[] | null>(null);
  const [recent, setRecent] = useState<LockerPackageWithLocker[] | null>(null);
  const [pendingQuery, setPendingQuery] = useState("");
  const [fotosDe, setFotosDe] = useState<LockerPackageWithLocker | null>(null);

  const loadLockers = useCallback(async () => {
    try {
      setLockers(await api<Locker[]>("/lockers"));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando casilleros",
      );
    }
  }, []);

  const loadFeeds = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        api<LockerPackageWithLocker[]>("/lockers/packages?status=PRE_ALERTED"),
        api<LockerPackageWithLocker[]>("/lockers/packages?status=RECEIVED"),
      ]);
      setPending(p);
      setRecent(r);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando recibos",
      );
    }
  }, []);

  useEffect(() => {
    loadLockers();
    loadFeeds();
  }, [loadLockers, loadFeeds]);

  const lockerMatches = useMemo(() => {
    if (!lockers) return [];
    const q = lockerQuery.trim().toLowerCase();
    if (!q) return lockers.slice(0, 6);
    return lockers
      .filter(
        (l) =>
          l.code.toLowerCase().includes(q) ||
          l.customerName.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [lockers, lockerQuery]);

  const pendingFiltered = useMemo(() => {
    if (!pending) return [];
    const q = pendingQuery.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) =>
      [
        p.externalTracking,
        p.merchant,
        p.description,
        p.locker.code,
        p.locker.customerName,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [pending, pendingQuery]);

  async function onIntake(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      toast.error("Selecciona un casillero primero");
      return;
    }
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const str = (v: string) => (v.trim() === "" ? undefined : v.trim());
    setBusy(true);
    try {
      const res = await api<IntakeResult>("/lockers/intake", {
        method: "POST",
        body: JSON.stringify({
          lockerId: selected.id,
          externalTracking: str(form.externalTracking),
          merchant: str(form.merchant),
          description: str(form.description),
          weightKg: num(form.weightKg),
          declaredValue: num(form.declaredValue),
          lengthCm: num(form.lengthCm),
          widthCm: num(form.widthCm),
          heightCm: num(form.heightCm),
          pieces: num(form.pieces),
          condition: form.condition,
          category: form.category || undefined,
        }),
      });
      toast.success(
        res.matched
          ? `Pre-alerta emparejada y recibida (${selected.code})`
          : `Paquete recibido en ${selected.code}`,
      );
      setForm(EMPTY);
      await loadFeeds();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo registrar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onReceivePending(pkg: LockerPackageWithLocker) {
    setBusy(true);
    try {
      await api(`/lockers/${pkg.lockerId}/packages/${pkg.id}/receive`, {
        method: "PATCH",
      });
      toast.success(`Recibido en ${pkg.locker.code}`);
      await loadFeeds();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo recibir",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Recepción de almacén</h1>
        <p className="text-sm text-muted-foreground">
          Registra paquetes recibidos en bodega y asócialos a un casillero, sin
          entrar a cada uno.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Registrar recibo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrar recibo</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onIntake} className="grid gap-4">
              <div className="grid gap-2">
                <Label>Casillero *</Label>
                {selected ? (
                  <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                    <span className="text-sm">
                      <span className="font-mono">{selected.code}</span> ·{" "}
                      {selected.customerName}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelected(null)}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Buscar por código o cliente…"
                        value={lockerQuery}
                        onChange={(e) => setLockerQuery(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1 rounded-md border p-1">
                      {!lockers ? (
                        <Skeleton className="h-9" />
                      ) : lockerMatches.length === 0 ? (
                        <p className="p-2 text-sm text-muted-foreground">
                          Sin coincidencias.
                        </p>
                      ) : (
                        lockerMatches.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              setSelected(l);
                              setLockerQuery("");
                            }}
                            className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            <span>
                              <span className="font-mono">{l.code}</span> ·{" "}
                              {l.customerName}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="externalTracking">Tracking del carrier</Label>
                <Input
                  id="externalTracking"
                  placeholder="1Z999AA10123456784"
                  value={form.externalTracking}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, externalTracking: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Si coincide con una pre-alerta pendiente del casillero, se
                  empareja automáticamente.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="merchant">Comercio</Label>
                  <Input
                    id="merchant"
                    placeholder="Amazon"
                    value={form.merchant}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, merchant: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Input
                    id="description"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="weightKg">Peso (kg)</Label>
                  <Input
                    id="weightKg"
                    type="number"
                    step="any"
                    min="0"
                    value={form.weightKg}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, weightKg: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="declaredValue">Valor (USD)</Label>
                  <Input
                    id="declaredValue"
                    type="number"
                    step="any"
                    min="0"
                    value={form.declaredValue}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, declaredValue: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Medidas: las tres o ninguna. Con dos de tres no hay volumen
                  que calcular, y asumir la que falta produce un cobro
                  inventado. */}
              <div className="grid grid-cols-3 gap-3">
                {(["lengthCm", "widthCm", "heightCm"] as const).map((campo, i) => (
                  <div key={campo} className="grid gap-2">
                    <Label htmlFor={campo}>
                      {["Largo", "Ancho", "Alto"][i]} (cm)
                    </Label>
                    <Input
                      id={campo}
                      type="number"
                      step="any"
                      min="0"
                      value={form[campo]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [campo]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>

              {/* Se enseña ANTES de guardar: si el cobrable sale del volumen y
                  no del peso, el operador tiene que poder verlo mientras el
                  bulto sigue en la báscula, no descubrirlo en la factura. */}
              {previo && (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  Volumétrico <strong>{previo.volumetrico} kg</strong> · cobrable{" "}
                  <strong>{previo.cobrable} kg</strong>
                  {previo.mandaVolumen && (
                    <span className="text-muted-foreground">
                      {" "}
                      — manda el volumen, no el peso
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    Estimado con divisor {DIVISOR_PREVIO}; el definitivo lo
                    calcula el servidor con el de tu empresa.
                  </span>
                </p>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="pieces">Bultos</Label>
                  <Input
                    id="pieces"
                    type="number"
                    min="1"
                    step="1"
                    value={form.pieces}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, pieces: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="condition">Estado</Label>
                  <select
                    id="condition"
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                    value={form.condition}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        condition: e.target.value as PackageCondition,
                      }))
                    }
                  >
                    {CONDICIONES.map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Contenido</Label>
                  <select
                    id="category"
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        category: e.target.value as PackageCategory | "",
                      }))
                    }
                  >
                    <option value="">Sin clasificar</option>
                    {CATEGORIAS.map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button type="submit" disabled={busy || !selected}>
                <PackageCheck className="size-4" />
                {busy ? "Registrando…" : "Registrar recibido"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Pre-alertas pendientes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pre-alertas pendientes{" "}
              {pending ? `(${pending.length})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar pre-alerta…"
                value={pendingQuery}
                onChange={(e) => setPendingQuery(e.target.value)}
              />
            </div>
            {!pending ? (
              <Skeleton className="h-40" />
            ) : pendingFiltered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay pre-alertas pendientes.
              </p>
            ) : (
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {pendingFiltered.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {p.description ?? p.merchant ?? "Paquete"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">
                          {p.externalTracking ?? "sin tracking"}
                        </span>{" "}
                        · {p.locker.code} · {p.locker.customerName}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onReceivePending(p)}
                    >
                      <Check className="size-4" />
                      Recibir
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recibos recientes */}
      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle className="text-base">Recibos recientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!recent ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Aún no hay paquetes recibidos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Casillero</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Recibido</TableHead>
                  <TableHead className="text-right">Fotos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">
                      {p.externalTracking ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {p.description ?? p.merchant ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/lockers/${p.locker.id}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {p.locker.code}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {p.locker.customerName}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* El cobrable es el que se factura; el real se enseña
                          debajo porque es lo que el cliente cree que pesa. */}
                      {p.chargeableWeightKg ?? p.weightKg ?? "—"}
                      {p.chargeableWeightKg &&
                        p.weightKg &&
                        p.chargeableWeightKg !== p.weightKg && (
                          <span className="block text-xs text-muted-foreground">
                            real {p.weightKg}
                          </span>
                        )}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(packageStatusBadgeClass(p.status))}>
                        {PACKAGE_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.receivedAt
                        ? new Date(p.receivedAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFotosDe(p)}
                      >
                        <Camera className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <FotosDelBulto paquete={fotosDe} onClose={() => setFotosDe(null)} />
    </div>
  );
}
