"use client";

import { FormEvent, useState } from "react";
import { Plus, Scale } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, CustomsCategory, CustomsRule } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { useConfirmar } from "@/components/confirmar";
import { PageHeader } from "@/components/page-header";
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
 * Reglas aduaneras.
 *
 * **Esto es lo que evita que las liquidaciones salgan con cifras que nadie
 * configuró.** Sin ninguna regla, el backend cae al cálculo antiguo y marca el
 * resultado como `defecto`; con reglas, cada cobro se puede explicar señalando
 * cuál se aplicó.
 *
 * Las reglas no se editan ni se borran: se cierran con fecha y se crea la
 * siguiente. Una liquidación de hace un año tiene que seguir pudiendo
 * explicarse con la regla que se le aplicó ese día.
 */

const CATEGORIAS: { valor: CustomsCategory; etiqueta: string; ayuda: string }[] =
  [
    { valor: "A", etiqueta: "A — Documentos", ayuda: "Correspondencia y documentos." },
    {
      valor: "B",
      etiqueta: "B — Comercial simplificada",
      ayuda: "Mercancía comercial bajo el trámite simplificado.",
    },
    {
      valor: "C",
      etiqueta: "C — Trámite general",
      ayuda: "Fuera del simplificado. Suele exigir agente aduanero.",
    },
    {
      valor: "ENVIO_FAMILIAR",
      etiqueta: "Envío familiar",
      ayuda: "Pequeño envío sin carácter comercial.",
    },
  ];

function etiquetaCategoria(c: CustomsCategory) {
  return CATEGORIAS.find((x) => x.valor === c)?.etiqueta ?? c;
}

/** De fracción a porcentaje legible: 0.15 -> "15 %". */
function pct(fraccion: string) {
  return `${(Number(fraccion) * 100).toFixed(2).replace(/\.?0+$/, "")} %`;
}

function vigente(r: CustomsRule) {
  const ahora = Date.now();
  return (
    new Date(r.effectiveFrom).getTime() <= ahora &&
    (r.effectiveTo === null || new Date(r.effectiveTo).getTime() > ahora)
  );
}

const VACIO = {
  country: "HN",
  category: "B" as CustomsCategory,
  maxValue: "",
  dutyRate: "",
  taxRate: "",
  requiresInvoice: false,
  requiresPermit: false,
  requiresBroker: false,
  effectiveFrom: "",
};

export default function CustomsRulesPage() {
  const confirmar = useConfirmar();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [busy, setBusy] = useState(false);

  const { datos, recargar: cargar } = useApi<CustomsRule[]>("/customs/rules", {
    mensajeDeError: "Error cargando las reglas",
  });
  // `?? null` para no cambiar el resto de la pantalla: antes esto era
  // `T | null` y `useApi` entrega `T | undefined`.
  const reglas = datos ?? null;

  async function crear(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/customs/rules", {
        method: "POST",
        body: JSON.stringify({
          country: form.country.trim().toUpperCase(),
          category: form.category,
          ...(form.maxValue ? { maxValue: Number(form.maxValue) } : {}),
          // El formulario pide porcentaje porque es como se habla de esto; la
          // API espera fracción. Convertir aquí evita que alguien escriba 15 y
          // acabe cobrando el 1500 %.
          dutyRate: Number(form.dutyRate) / 100,
          taxRate: Number(form.taxRate) / 100,
          requiresInvoice: form.requiresInvoice,
          requiresPermit: form.requiresPermit,
          requiresBroker: form.requiresBroker,
          ...(form.effectiveFrom
            ? { effectiveFrom: new Date(form.effectiveFrom).toISOString() }
            : {}),
        }),
      });
      toast.success("Regla creada");
      setForm(VACIO);
      setAbierto(false);
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  async function cerrar(r: CustomsRule) {
    if (
      !(await confirmar({
        titulo: `¿Cerrar la regla ${etiquetaCategoria(r.category)} de ${r.country}?`,
        descripcion:
          "Deja de aplicarse desde ahora, pero se conserva: las liquidaciones que se hicieron con ella tienen que seguir pudiendo explicarse.",
        accion: "Cerrar la regla",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api(`/customs/rules/${r.id}/cerrar`, {
        method: "PATCH",
        body: JSON.stringify({ effectiveTo: new Date().toISOString() }),
      });
      toast.success("Regla cerrada");
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cerrar");
    } finally {
      setBusy(false);
    }
  }

  const hayVigentes = reglas?.some(vigente) ?? false;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reglas de aduana"
        actions={
          <Button onClick={() => setAbierto(true)}>
            <Plus className="size-4" />
            Nueva regla
          </Button>
        }
      />

      {reglas && !hayVigentes && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 text-sm">
            <strong>No hay ninguna regla vigente.</strong> Mientras siga así,
            cada liquidación se calcula con valores por defecto que nadie
            configuró y se marca como <code>defecto</code>. Con al menos una
            regla, cada cobro se puede explicar señalando cuál se aplicó.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {reglas ? `${reglas.length} regla(s)` : "Cargando…"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!reglas ? (
            <Skeleton className="h-40 w-full" />
          ) : reglas.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-6">
              <Scale className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Una regla dice hasta qué valor aplica cada categoría, qué se
                liquida y qué documentos exige. Se elige sola: gana la categoría
                más barata que cubra el valor aduanero del envío.
              </p>
              <Button variant="outline" onClick={() => setAbierto(true)}>
                Crear la primera
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>País</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Hasta</TableHead>
                  <TableHead className="text-right">Arancel</TableHead>
                  <TableHead className="text-right">Impuesto</TableHead>
                  <TableHead>Exige</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reglas.map((r) => {
                  const viva = vigente(r);
                  return (
                    <TableRow key={r.id} className={viva ? "" : "opacity-60"}>
                      <TableCell className="font-mono">{r.country}</TableCell>
                      <TableCell>{etiquetaCategoria(r.category)}</TableCell>
                      <TableCell className="text-right">
                        {r.maxValue ? `${r.maxValue} ${r.currency}` : "sin tope"}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(r.dutyRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(r.taxRate)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[
                          r.requiresInvoice && "factura",
                          r.requiresPermit && "permiso",
                          r.requiresBroker && "agente",
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {viva ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            Vigente
                          </Badge>
                        ) : (
                          <Badge className="bg-muted text-muted-foreground">
                            {new Date(r.effectiveFrom) > new Date()
                              ? "Futura"
                              : "Cerrada"}
                          </Badge>
                        )}
                        <span className="mt-1 block text-muted-foreground">
                          {new Date(r.effectiveFrom).toLocaleDateString()}
                          {r.effectiveTo
                            ? ` → ${new Date(r.effectiveTo).toLocaleDateString()}`
                            : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {viva && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => cerrar(r)}
                          >
                            Cerrar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva regla</DialogTitle>
          </DialogHeader>
          <form onSubmit={crear} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="country">País *</Label>
                <Input
                  id="country"
                  required
                  maxLength={2}
                  className="uppercase"
                  value={form.country}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxValue">Hasta (valor aduanero)</Label>
                <Input
                  id="maxValue"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="sin tope"
                  value={form.maxValue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxValue: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Categoría *</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as CustomsCategory }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {CATEGORIAS.find((c) => c.valor === form.category)?.ayuda}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dutyRate">Arancel (%) *</Label>
                <Input
                  id="dutyRate"
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  required
                  placeholder="15"
                  value={form.dutyRate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dutyRate: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="taxRate">Impuesto (%) *</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  required
                  placeholder="15"
                  value={form.taxRate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, taxRate: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Se calcula sobre valor + arancel.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">Exige</span>
              {(
                [
                  ["requiresInvoice", "Factura comercial"],
                  ["requiresPermit", "Permiso"],
                  ["requiresBroker", "Agente aduanero"],
                ] as const
              ).map(([campo, etiqueta]) => (
                <label key={campo} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form[campo]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [campo]: e.target.checked }))
                    }
                  />
                  {etiqueta}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Un envío bajo esta regla no se puede liberar de aduana sin los
                documentos marcados.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="effectiveFrom">Rige desde</Label>
              <Input
                id="effectiveFrom"
                type="date"
                value={form.effectiveFrom}
                onChange={(e) =>
                  setForm((f) => ({ ...f, effectiveFrom: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                En blanco, desde ahora. Se puede fechar en el futuro: una norma
                que se publica hoy y entra en vigor el mes que viene se carga
                cuando se conoce, no el día que empieza.
              </p>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Creando…" : "Crear regla"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
