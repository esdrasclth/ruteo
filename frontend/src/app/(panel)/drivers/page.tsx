"use client";

import { FormEvent, useState } from "react";
import { Plus, Trash2, Users, Route as RouteIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Driver,
  DriverStatus,
  VehicleType,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  DRIVER_STATUS_LABELS,
  VEHICLE_LABELS,
  driverStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { useConfirmar } from "@/components/confirmar";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export default function DriversPage() {
  const confirmar = useConfirmar();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    vehicleType: "MOTORCYCLE" as VehicleType,
    vehiclePlate: "",
  });

  const { datos, recargar: load } = useApi<Driver[]>("/drivers", {
    mensajeDeError: "Error cargando drivers",
  });
  // `?? null` para no cambiar el resto de la pantalla: antes esto era
  // `T | null` y `useApi` entrega `T | undefined`.
  const drivers = datos ?? null;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api<Driver>("/drivers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          vehicleType: form.vehicleType,
          vehiclePlate: form.vehiclePlate.trim() || undefined,
        }),
      });
      toast.success("Driver creado");
      setOpen(false);
      setForm({
        name: "",
        phone: "",
        vehicleType: "MOTORCYCLE",
        vehiclePlate: "",
      });
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear el driver",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onStatusChange(driver: Driver, status: DriverStatus) {
    try {
      await api(`/drivers/${driver.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(`${driver.name}: ${DRIVER_STATUS_LABELS[status]}`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar",
      );
    }
  }

  async function onDelete(driver: Driver) {
    if (
      !(await confirmar({
        titulo: `¿Eliminar a ${driver.name}?`,
        descripcion:
          "Dejará de poder asignarse a rutas. Las entregas que ya hizo se conservan.",
        accion: "Eliminar",
        peligro: true,
      }))
    ) {
      return;
    }
    try {
      await api(`/drivers/${driver.id}`, { method: "DELETE" });
      toast.success("Driver eliminado");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo eliminar",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Repartidores"
        description={drivers ? `${drivers.length} en la flota` : "Cargando…"}
        actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Nuevo driver
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo driver</DialogTitle>
            </DialogHeader>
            <form onSubmit={onCreate} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  placeholder="+504..."
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Vehículo</Label>
                  <Select
                    value={form.vehicleType}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, vehicleType: v as VehicleType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(VEHICLE_LABELS) as VehicleType[]).map(
                        (v) => (
                          <SelectItem key={v} value={v}>
                            {VEHICLE_LABELS[v]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="plate">Placa</Label>
                  <Input
                    id="plate"
                    placeholder="HAB-1234"
                    value={form.vehiclePlate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vehiclePlate: e.target.value }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creando…" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        }
      />

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {!drivers ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sin repartidores"
              description="Sin repartidores no se pueden crear rutas: son a quien se le asignan las paradas."
              action={
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus className="size-4" />
                  Nuevo repartidor
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.phone ?? "—"}</TableCell>
                    <TableCell>{VEHICLE_LABELS[d.vehicleType]}</TableCell>
                    <TableCell>{d.vehiclePlate ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={d.status}
                        onValueChange={(v) =>
                          onStatusChange(d, v as DriverStatus)
                        }
                      >
                        <SelectTrigger className="h-8 w-40">
                          <Badge className={driverStatusBadgeClass(d.status)}>
                            {DRIVER_STATUS_LABELS[d.status]}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.keys(DRIVER_STATUS_LABELS) as DriverStatus[]
                          ).map((s) => (
                            <SelectItem key={s} value={s}>
                              {DRIVER_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Salto al trabajo real del repartidor: sus rutas. */}
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/routes?driverId=${d.id}`}>
                            <RouteIcon className="size-4" />
                            Rutas
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(d)}
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
    </div>
  );
}
