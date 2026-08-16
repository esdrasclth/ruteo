"use client";

import { FormEvent, useState } from "react";
import { Pencil, Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, Warehouse, WarehouseType } from "@/lib/api";
import { useApi } from "@/lib/use-api";
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

/**
 * Bodegas y sucursales.
 *
 * Hasta ahora «Miami» y «bodega HN» eran cadenas de texto dentro de los envíos.
 * Con filas detrás se puede filtrar, contar y —lo que hacía falta para el cotejo
 * de manifiestos— decir contra qué bodega se está contando lo que llegó.
 */

const TIPOS: { valor: WarehouseType; etiqueta: string; ayuda: string }[] = [
  {
    valor: "ORIGIN",
    etiqueta: "Origen",
    ayuda: "Donde se recibe del comercio. Miami, típicamente.",
  },
  {
    valor: "DESTINATION",
    etiqueta: "Destino",
    ayuda: "Donde llega la carga y se desconsolida.",
  },
  {
    valor: "BRANCH",
    etiqueta: "Sucursal",
    ayuda: "Punto donde el cliente puede retirar.",
  },
];

function etiquetaTipo(t: WarehouseType) {
  return TIPOS.find((x) => x.valor === t)?.etiqueta ?? t;
}

function claseTipo(t: WarehouseType) {
  switch (t) {
    case "ORIGIN":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "DESTINATION":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "BRANCH":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  }
}

const VACIO = {
  code: "",
  name: "",
  type: "ORIGIN" as WarehouseType,
  country: "",
  city: "",
  addressLine: "",
  allowsPickup: false,
  active: true,
};

export default function WarehousesPage() {
  const [busy, setBusy] = useState(false);
  const [abierto, setAbierto] = useState(false);
  /** Null = alta. Con valor = edición de esa bodega. */
  const [editando, setEditando] = useState<Warehouse | null>(null);
  const [form, setForm] = useState(VACIO);

  const { datos, recargar: cargar } = useApi<Warehouse[]>("/warehouses", {
    mensajeDeError: "Error cargando bodegas",
  });
  // `?? null` para no cambiar el resto de la pantalla: antes esto era
  // `T | null` y `useApi` entrega `T | undefined`.
  const bodegas = datos ?? null;

  function abrirAlta() {
    setEditando(null);
    setForm(VACIO);
    setAbierto(true);
  }

  function abrirEdicion(b: Warehouse) {
    setEditando(b);
    setForm({
      code: b.code,
      name: b.name,
      type: b.type,
      country: b.country,
      city: b.city ?? "",
      addressLine: b.addressLine ?? "",
      allowsPickup: b.allowsPickup,
      active: b.active,
    });
    setAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Los opcionales vacíos no se mandan: el DTO los valida si vienen, y una
    // cadena vacía en `city` es ruido, no un dato.
    const cuerpo = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      type: form.type,
      country: form.country.trim().toUpperCase(),
      ...(form.city.trim() ? { city: form.city.trim() } : {}),
      ...(form.addressLine.trim()
        ? { addressLine: form.addressLine.trim() }
        : {}),
      allowsPickup: form.allowsPickup,
      active: form.active,
    };

    try {
      if (editando) {
        await api(`/warehouses/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify(cuerpo),
        });
        toast.success("Bodega actualizada");
      } else {
        await api("/warehouses", {
          method: "POST",
          body: JSON.stringify(cuerpo),
        });
        toast.success("Bodega creada");
      }
      setAbierto(false);
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  // Desactivar en vez de borrar: una bodega ya está referenciada por bultos
  // recibidos y por viajes, y borrarla dejaría ese histórico sin poder decir
  // dónde ocurrieron las cosas. Inactiva desaparece de los desplegables y no
  // rompe nada de lo pasado.
  async function alternarActiva(b: Warehouse) {
    setBusy(true);
    try {
      await api(`/warehouses/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !b.active }),
      });
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bodegas</h1>
        <Button onClick={abrirAlta}>
          <Plus className="size-4" />
          Nueva bodega
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {bodegas ? `${bodegas.length} bodega(s)` : "Cargando…"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!bodegas ? (
            <Skeleton className="h-40 w-full" />
          ) : bodegas.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-6">
              <WarehouseIcon
                className="size-8 text-muted-foreground"
                aria-hidden
              />
              <p className="text-sm text-muted-foreground">
                Todavía no hay bodegas. Sin al menos una de origen y una de
                destino, un viaje no puede decir de dónde sale ni a dónde llega,
                y el cotejo de manifiestos no tiene contra qué contar lo que
                llega.
              </p>
              <Button variant="outline" onClick={abrirAlta}>
                Crear la primera
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Retiro</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bodegas.map((b) => (
                  <TableRow key={b.id} className={b.active ? "" : "opacity-60"}>
                    <TableCell className="font-mono">{b.code}</TableCell>
                    <TableCell>{b.name}</TableCell>
                    <TableCell>
                      <Badge className={claseTipo(b.type)}>
                        {etiquetaTipo(b.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[b.city, b.country].filter(Boolean).join(", ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.allowsPickup ? "Sí" : "—"}
                    </TableCell>
                    <TableCell>
                      {b.active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          Activa
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground">
                          Inactiva
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => abrirEdicion(b)}
                        aria-label={`Editar ${b.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-1"
                        disabled={busy}
                        onClick={() => alternarActiva(b)}
                      >
                        {b.active ? "Desactivar" : "Activar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editando ? `Editar ${editando.code}` : "Nueva bodega"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={guardar} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  required
                  maxLength={20}
                  placeholder="MIA-01"
                  className="font-mono"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Corto y legible: es lo que se dice por radio.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  required
                  maxLength={120}
                  placeholder="Bodega Miami"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Tipo *</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, type: v as WarehouseType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {TIPOS.find((t) => t.valor === form.type)?.ayuda}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="country">País *</Label>
                <Input
                  id="country"
                  required
                  maxLength={2}
                  placeholder="US"
                  className="uppercase"
                  value={form.country}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Dos letras: US, HN.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="city">Ciudad</Label>
                <Input
                  id="city"
                  maxLength={120}
                  placeholder="Miami"
                  value={form.city}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="addressLine">Dirección</Label>
              <Input
                id="addressLine"
                maxLength={255}
                placeholder="8200 NW 27th St, Doral, FL 33122"
                value={form.addressLine}
                onChange={(e) =>
                  setForm((f) => ({ ...f, addressLine: e.target.value }))
                }
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.allowsPickup}
                onChange={(e) =>
                  setForm((f) => ({ ...f, allowsPickup: e.target.checked }))
                }
              />
              <span>
                El cliente puede retirar aquí
                <span className="block text-xs text-muted-foreground">
                  Marca las sucursales que atienden público. Decide dónde se
                  puede elegir «retiro en sucursal» como modo de entrega.
                </span>
              </span>
            </label>

            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando…" : editando ? "Guardar" : "Crear bodega"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
