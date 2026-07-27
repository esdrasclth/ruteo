"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, Locker } from "@/lib/api";
import { LOCKER_STATUS_LABELS } from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY_FORM = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  addressLine1: "8001 NW 25th St",
  city: "Miami",
  state: "FL",
  postalCode: "33122",
};

export default function LockersPage() {
  const router = useRouter();
  const [lockers, setLockers] = useState<Locker[] | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      setLockers(await api<Locker[]>("/lockers"));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando casilleros",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(field: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const locker = await api<Locker>("/lockers", {
        method: "POST",
        body: JSON.stringify({
          customerName: form.customerName.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          customerPhone: form.customerPhone.trim() || undefined,
          addressLine1: form.addressLine1.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          postalCode: form.postalCode.trim(),
        }),
      });
      toast.success(`Casillero creado: ${locker.code}`);
      setOpen(false);
      setForm(EMPTY_FORM);
      router.push(`/lockers/${locker.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear el casillero",
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Casilleros USA</h1>
          <p className="text-sm text-muted-foreground">
            {lockers ? `${lockers.length} casilleros` : "Cargando…"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Nuevo casillero
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo casillero virtual</DialogTitle>
            </DialogHeader>
            <form onSubmit={onCreate} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="customerName">Cliente *</Label>
                <Input
                  id="customerName"
                  required
                  value={form.customerName}
                  onChange={set("customerName")}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="customerEmail">Correo</Label>
                  <Input
                    id="customerEmail"
                    type="email"
                    value={form.customerEmail}
                    onChange={set("customerEmail")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customerPhone">Teléfono</Label>
                  <Input
                    id="customerPhone"
                    placeholder="+504..."
                    value={form.customerPhone}
                    onChange={set("customerPhone")}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="addressLine1">Dirección (bodega USA) *</Label>
                <Input
                  id="addressLine1"
                  required
                  value={form.addressLine1}
                  onChange={set("addressLine1")}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="city">Ciudad *</Label>
                  <Input
                    id="city"
                    required
                    value={form.city}
                    onChange={set("city")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="state">Estado *</Label>
                  <Input
                    id="state"
                    required
                    value={form.state}
                    onChange={set("state")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="postalCode">ZIP *</Label>
                  <Input
                    id="postalCode"
                    required
                    value={form.postalCode}
                    onChange={set("postalCode")}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creando…" : "Crear casillero"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {!lockers ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : lockers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Sin casilleros. Crea el primero para asignar una dirección en USA
              a un cliente.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lockers.map((l) => (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/lockers/${l.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {l.code}
                    </TableCell>
                    <TableCell className="font-medium">
                      {l.customerName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.customerEmail ?? l.customerPhone ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-sm">
                      {l.addressLine1}, {l.city}, {l.state} {l.postalCode}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          l.status === "ACTIVE"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {LOCKER_STATUS_LABELS[l.status]}
                      </Badge>
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
