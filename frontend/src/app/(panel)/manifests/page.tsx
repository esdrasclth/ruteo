"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, ManifestRow, Paginated } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  MANIFEST_STATUS_LABELS,
  manifestStatusBadgeClass,
} from "@/lib/fase2";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ManifestsPage() {
  const [abrir, setAbrir] = useState(false);
  const [numero, setNumero] = useState("");
  const [busy, setBusy] = useState(false);

  const { datos: respuesta, recargar: cargar } = useApi<Paginated<ManifestRow>>(
    "/manifests?page=1&pageSize=50",
    { mensajeDeError: "Error cargando manifiestos" },
  );
  // `?? null` para no cambiar el resto de la pantalla: antes esto era
  // `T | null` y `useApi` entrega `T | undefined`.
  const datos = respuesta ?? null;

  async function crear(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const m = await api<ManifestRow>("/manifests", {
        method: "POST",
        body: JSON.stringify({ number: numero.trim() }),
      });
      toast.success(`Manifiesto ${m.number} creado`);
      setAbrir(false);
      setNumero("");
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manifiestos</h1>
        <Button onClick={() => setAbrir(true)}>
          <Plus className="size-4" />
          Nuevo manifiesto
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {datos ? `${datos.total} manifiesto(s)` : "Cargando…"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!datos ? (
            <Skeleton className="h-40 w-full" />
          ) : datos.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay manifiestos. Uno agrupa las guías que viajan juntas
              en un mismo vuelo, y es contra él que se cotea lo que llega.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Vuelo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Guías</TableHead>
                  <TableHead className="text-right">
                    Declarado / recibido
                  </TableHead>
                  <TableHead className="text-right">Excepciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link
                        href={`/manifests/${m.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {m.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.trip?.flightNumber ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={manifestStatusBadgeClass(m.status)}>
                        {MANIFEST_STATUS_LABELS[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {m._count.items}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {m.totalPieces} / {m.totalWeightKg} kg
                      {m.receivedPieces !== null && (
                        <span
                          className={
                            m.receivedPieces === m.totalPieces
                              ? "block text-xs text-emerald-600"
                              : "block text-xs font-medium text-red-600"
                          }
                        >
                          recibido {m.receivedPieces} / {m.receivedWeightKg} kg
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {m._count.exceptions > 0 ? (
                        <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">
                          {m._count.exceptions}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={abrir} onOpenChange={setAbrir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo manifiesto</DialogTitle>
          </DialogHeader>
          <form onSubmit={crear} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="numero">Número *</Label>
              <Input
                id="numero"
                required
                placeholder="MANIFEST-HN-2026-0087"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                El que exige Aduanas. Único por empresa.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
