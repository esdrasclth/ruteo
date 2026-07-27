"use client";

import { FormEvent, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, Customer, CustomerDetail } from "@/lib/api";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/shipment-status";
import {
  LOCKER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/logistics";
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

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    documentId: "",
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      setCustomer(await api<CustomerDetail>(`/customers/${id}`));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando el cliente",
      );
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit() {
    if (!customer) return;
    setForm({
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      documentId: customer.documentId ?? "",
      notes: customer.notes ?? "",
    });
    setEditOpen(true);
  }

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api<Customer>(`/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          documentId: form.documentId.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      toast.success("Cliente actualizado");
      setEditOpen(false);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!customer) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/customers">
              <ArrowLeft className="size-4" />
              Clientes
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{customer.name}</h1>
            <p className="text-sm text-muted-foreground">
              {customer.email ?? customer.phone ?? "Sin contacto"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}>
          <Pencil className="size-4" />
          Editar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Row label="Correo" value={customer.email} />
            <Row label="Teléfono" value={customer.phone} />
            <Row label="Documento" value={customer.documentId} />
            <Row label="Notas" value={customer.notes} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Resumen de pagos</CardTitle>
          </CardHeader>
          <CardContent>
            {customer.paymentSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pagos.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {customer.paymentSummary.map((p) => (
                  <div
                    key={p.status}
                    className="rounded-md border p-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      {PAYMENT_STATUS_LABELS[p.status]}
                    </p>
                    <p className="text-lg font-semibold">{p.amount ?? "0"}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.count} pago(s)
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Casilleros ({customer.lockers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {customer.lockers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sin casilleros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.lockers.map((l) => (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/lockers/${l.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {l.code}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Envíos ({customer.shipments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {customer.shipments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sin envíos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.shipments.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/shipments/${s.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {s.trackingNumber}
                    </TableCell>
                    <TableCell className="text-sm">
                      {TYPE_LABELS[s.type]}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-muted text-muted-foreground">
                        {STATUS_LABELS[s.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSave} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nombre *</Label>
              <Input
                id="edit-name"
                required
                value={form.name}
                onChange={set("name")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Correo</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Teléfono</Label>
                <Input
                  id="edit-phone"
                  value={form.phone}
                  onChange={set("phone")}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-documentId">Documento</Label>
              <Input
                id="edit-documentId"
                value={form.documentId}
                onChange={set("documentId")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notas</Label>
              <Input
                id="edit-notes"
                value={form.notes}
                onChange={set("notes")}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}
