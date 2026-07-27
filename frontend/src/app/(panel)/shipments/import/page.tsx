"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, Upload } from "lucide-react";
import { toast } from "sonner";
import { API_URL, getSession, ImportResult } from "@/lib/api";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TEMPLATE_HEADER =
  "type,recipientName,recipientPhone,originLabel,originCountry,destinationLabel,destinationCountry,destinationLat,destinationLng,weightKg,declaredValue,codAmount,currency";

const TEMPLATE_ROWS = [
  "LOCAL,Juan Pérez,+50499001122,Bodega Central,HN,Col. Kennedy Tegucigalpa,HN,14.065,-87.192,2.5,,350,HNL",
  "LOCAL,María García,+50488334455,Bodega Central,HN,Comayagüela,HN,14.09,-87.21,1.2,,,HNL",
];

export default function ImportShipmentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function downloadTemplate() {
    const csv = [TEMPLATE_HEADER, ...TEMPLATE_ROWS].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-envios.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    const session = getSession();
    if (!file || !session) return;
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_URL}/shipments/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body,
      });
      const data = (await res.json()) as ImportResult & { message?: string };
      if (!res.ok) {
        toast.error(
          Array.isArray(data.message)
            ? (data.message as string[]).join(". ")
            : (data.message ?? "No se pudo importar"),
        );
        return;
      }
      setResult(data);
      toast.success(
        `${data.createdCount} envío(s) creados, ${data.failedCount} con error`,
      );
    } catch {
      toast.error("No se pudo importar el archivo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/shipments">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Importar envíos (CSV)</h1>
          <p className="text-sm text-muted-foreground">
            Crea envíos en lote desde un archivo CSV con encabezado
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <form
            onSubmit={onImport}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="grid gap-2">
              <Label htmlFor="csv">Archivo CSV</Label>
              <Input
                id="csv"
                type="file"
                accept=".csv,text/csv"
                className="w-72"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button type="submit" disabled={!file || busy}>
              <Upload className="size-4" />
              {busy ? "Importando…" : "Importar"}
            </Button>
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <FileDown className="size-4" />
              Descargar plantilla
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Columnas: {TEMPLATE_HEADER.split(",").join(", ")}. Las filas
            inválidas se reportan sin abortar el lote.
          </p>
        </CardContent>
      </Card>

      {result ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Creados</CardTitle>
                <Badge className="bg-primary text-primary-foreground">
                  {result.createdCount}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {result.created.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Ningún envío creado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Línea</TableHead>
                      <TableHead>Tracking</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.created.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.line}</TableCell>
                        <TableCell>
                          <Link
                            href={`/shipments/${c.id}`}
                            className="font-mono text-xs underline-offset-2 hover:underline"
                          >
                            {c.trackingNumber}
                          </Link>
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Errores</CardTitle>
                <Badge
                  className={
                    result.failedCount > 0
                      ? "bg-destructive/10 text-destructive border border-destructive/30"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {result.failedCount}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {result.errors.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Sin errores.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Línea</TableHead>
                      <TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((e) => (
                      <TableRow key={e.line}>
                        <TableCell>{e.line}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.errors.join(". ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
