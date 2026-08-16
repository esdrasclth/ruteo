"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, TenantProfile } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Datos con los que Ruteo factura A ESTA EMPRESA.
 *
 * No se piden en el alta a propósito: nadie necesita un RTN para rastrear un
 * paquete, y cada campo en un registro es gente que no termina el registro. Se
 * exigen en el momento en que hacen falta —al contratar un plan de pago—, que es
 * el mismo criterio que «no liberar de aduana con saldo pendiente».
 *
 * Lo que NO es esto: los datos para que la empresa facture a SUS clientes (CAI,
 * rango de correlativos, fecha límite de emisión). Eso caduca y necesita su
 * propia pantalla con avisos de vencimiento; meterlo aquí lo condena a quedarse
 * obsoleto sin que nadie se entere.
 */
export function DatosFiscales() {
  // Misma clave que usa la pantalla de Empresa, que además renderiza esta
  // tarjeta: antes eran DOS peticiones idénticas a `/tenants/me` en cada
  // visita, una por cada componente. Ahora es una.
  const { datos: perfil, recargar } = useApi<TenantProfile>("/tenants/me", {
    mensajeDeError: "Error cargando la ficha",
  });

  if (!perfil) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Datos fiscales</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  // La `key` reinicia el formulario cuando la ficha cambia de verdad. Antes se
  // rellenaba desde un `useEffect`, y eso tenía un fallo silencioso: una
  // revalidación en segundo plano pisaba lo que el usuario estuviera
  // escribiendo.
  return <FichaFiscal key={perfil.id} perfil={perfil} recargar={recargar} />;
}

function FichaFiscal({
  perfil,
  recargar,
}: {
  perfil: TenantProfile;
  recargar: (datos?: TenantProfile) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    legalName: perfil.legalName ?? "",
    taxId: perfil.taxId ?? "",
    billingEmail: perfil.billingEmail ?? "",
    billingAddress: perfil.billingAddress ?? "",
    phone: perfil.phone ?? "",
  });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      // Los campos vacíos NO se mandan: el DTO valida formato —un RTN son 14
      // dígitos, el correo es un correo— y una cadena vacía se rechazaría,
      // dejando la pantalla sin poder guardar nada mientras falte un dato.
      //
      // El precio de esto es que desde aquí no se puede dejar un campo en
      // blanco, solo corregirlo. Se acepta: borrar el RTN de una empresa que ya
      // factura no es una operación que debiera ser un descuido de un clic.
      const actualizado = await api<TenantProfile>("/tenants/me", {
        method: "PATCH",
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(form).filter(([, v]) => v.trim() !== ""),
          ),
        ),
      });
      // Se escribe la respuesta en la caché en vez de volver a pedirla: el
      // PATCH ya devolvió la ficha actualizada. Y como la clave es compartida,
      // la pantalla de Empresa ve el cambio sin pedir nada.
      recargar(actualizado);
      toast.success("Datos de facturación guardados");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudieron guardar",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Datos fiscales
          {perfil.facturacion.completa ? (
            <span className="flex items-center gap-1 text-xs font-normal text-emerald-600">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Completos
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-normal text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Incompletos
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!perfil.facturacion.completa && (
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            Con esto sin completar puedes operar con normalidad, pero no podrás
            contratar un plan de pago: la factura tiene que ir a nombre de
            alguien.
          </p>
        )}

        <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="legalName">Razón social</Label>
            <Input
              id="legalName"
              value={form.legalName}
              onChange={(e) =>
                setForm({ ...form, legalName: e.target.value })
              }
              placeholder="Encomiendas Aviotech S. de R.L."
            />
            <p className="text-xs text-muted-foreground">
              El nombre legal, que puede no ser el comercial.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="taxId">RTN</Label>
            <Input
              id="taxId"
              inputMode="numeric"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              placeholder="08019995123456"
            />
            <p className="text-xs text-muted-foreground">
              14 dígitos. Puedes escribirlo con guiones: se guardan solo los
              números.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="billingEmail">Correo de facturación</Label>
            <Input
              id="billingEmail"
              type="email"
              value={form.billingEmail}
              onChange={(e) =>
                setForm({ ...form, billingEmail: e.target.value })
              }
              placeholder="facturacion@tuempresa.com"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+504 9999-8888"
            />
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="billingAddress">Dirección fiscal</Label>
            <Input
              id="billingAddress"
              value={form.billingAddress}
              onChange={(e) =>
                setForm({ ...form, billingAddress: e.target.value })
              }
              placeholder="Col. Palmira, Tegucigalpa, Honduras"
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar datos"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
