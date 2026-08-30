"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Contact, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Customer,
  CustomerListItem,
  Paginated,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Paginacion } from "@/components/paginacion";
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
import {
  MobileList,
  MobileListCard,
  MobileListMeta,
} from "@/components/responsive-list";
import {
  paginaDesdeUrl,
  useUrlFilters,
  useUrlSearch,
} from "@/lib/use-url-filters";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  documentId: "",
  notes: "",
};

export default function CustomersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <CustomersContent />
    </Suspense>
  );
}

function CustomersContent() {
  const router = useRouter();
  const { searchParams, actualizar } = useUrlFilters();
  const {
    borrador: search,
    setBorrador: setSearch,
    aplicado: busqueda,
  } = useUrlSearch();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const page = paginaDesdeUrl(searchParams);

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (busqueda) params.set("search", busqueda);

  const { datos } = useApi<Paginated<CustomerListItem>>(
    `/customers?${params}`,
    { mensajeDeError: "Error cargando clientes", keepPreviousData: true },
  );
  const customers = datos?.items ?? null;

  function set(field: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const customer = await api<Customer>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          documentId: form.documentId.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      toast.success("Cliente creado");
      setOpen(false);
      setForm(EMPTY_FORM);
      router.push(`/customers/${customer.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear el cliente",
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Clientes"
        description={
          datos
            ? `${datos.total} cliente${datos.total === 1 ? "" : "s"}${
                busqueda ? ` para “${busqueda}”` : ""
              }`
            : "Cargando…"
        }
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Nuevo cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo cliente</DialogTitle>
            </DialogHeader>
            <form onSubmit={onCreate} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={set("name")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    placeholder="+504..."
                    value={form.phone}
                    onChange={set("phone")}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="documentId">Documento</Label>
                <Input
                  id="documentId"
                  value={form.documentId}
                  onChange={set("documentId")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notas</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={set("notes")}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creando…" : "Crear cliente"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Buscar clientes"
          className="pl-9"
          placeholder="Buscar por nombre, correo, teléfono o documento"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0" aria-busy={!customers}>
          {!customers ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <EmptyState
              icon={Contact}
              title={busqueda ? "Sin coincidencias" : "Sin clientes"}
              description={
                busqueda
                  ? `Ningún cliente coincide con “${busqueda}”. La búsqueda ignora las tildes, así que «lopez» encuentra «López».`
                  : "Crea el primero o se generarán solos al abrir casilleros."
              }
              action={
                busqueda ? null : (
                  <Button size="sm" onClick={() => setOpen(true)}>
                    <Plus className="size-4" />
                    Nuevo cliente
                  </Button>
                )
              }
            />
          ) : (
            <>
              <MobileList label="Clientes">
                {customers.map((c) => (
                  <MobileListCard
                    key={c.id}
                    href={`/customers/${c.id}`}
                    label={`Abrir cliente ${c.name}`}
                  >
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {c.email ?? c.phone ?? "Sin datos de contacto"}
                    </p>
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      <MobileListMeta label="Casilleros">
                        {c._count.lockers} casilleros
                      </MobileListMeta>
                      <MobileListMeta label="Envíos">
                        {c._count.shipments} envíos
                      </MobileListMeta>
                    </div>
                  </MobileListCard>
                ))}
              </MobileList>
              <div className="hidden md:block">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead className="text-right">Casilleros</TableHead>
                  <TableHead className="text-right">Envíos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.email ?? c.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.documentId ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {c._count.lockers}
                    </TableCell>
                    <TableCell className="text-right">
                      {c._count.shipments}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {datos ? (
        <Paginacion
          page={datos.page}
          pageSize={datos.pageSize}
          total={datos.total}
          onPage={(siguiente) => actualizar({ page: siguiente }, "push")}
          etiqueta="clientes"
        />
      ) : null}
    </div>
  );
}
