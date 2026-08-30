"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api, ApiError, TenantProfile } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { DatosFiscales } from "@/components/datos-fiscales";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * La ficha de la empresa.
 *
 * Antes lo único editable de la empresa eran los datos fiscales, y vivían
 * dentro de Facturación. Ahí los encuentra quien va a contratar un plan, pero
 * no quien busca «cómo se llama mi empresa en el sistema» o «qué divisor
 * volumétrico tenemos negociado». Esta pantalla es ese sitio; los datos
 * fiscales siguen siendo el mismo formulario, traído aquí en vez de duplicado.
 */
export default function EmpresaPage() {
  // La misma clave que pide `DatosFiscales`, que se renderiza más abajo en
  // esta misma pantalla: antes eran dos peticiones idénticas a `/tenants/me`.
  const { datos: perfil, recargar } = useApi<TenantProfile>("/tenants/me", {
    mensajeDeError: "Error cargando la empresa",
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent, datos: Record<string, unknown>) {
    e.preventDefault();
    setGuardando(true);
    try {
      const actualizado = await api<TenantProfile>("/tenants/me", {
        method: "PATCH",
        body: JSON.stringify(datos),
      });
      // El PATCH ya devuelve la ficha entera: se escribe en la caché en vez de
      // volver a pedirla, y la tarjeta fiscal de abajo se entera sola.
      await recargar(actualizado, { revalidate: false });
      toast.success("Guardado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mi empresa"
        description="Cómo se llama, cómo se factura y con qué reglas calcula."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidad</CardTitle>
        </CardHeader>
        <CardContent>
          {!perfil ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Identidad
              key={`identidad-${perfil.name}`}
              perfil={perfil}
              guardando={guardando}
              guardar={guardar}
            />
          )}
        </CardContent>
      </Card>

      {/* El MISMO formulario que estaba en Facturación, no una copia. Dos
          formularios sobre los mismos campos se separan al primer cambio y
          acaban validando distinto. */}
      <DatosFiscales />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Peso volumétrico</CardTitle>
        </CardHeader>
        <CardContent>
          {!perfil ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Volumetrico
              key={`divisor-${perfil.volumetricDivisor}`}
              perfil={perfil}
              guardando={guardando}
              guardar={guardar}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Los dos formularios van aparte y con `key`.
 *
 * Antes sus campos se rellenaban desde el mismo `useEffect` que traía la ficha
 * —`setNombre(p.name)`, `setDivisor(...)`—, y eso además de ser un render en
 * cascada tenía un fallo que no se veía: cualquier refresco en segundo plano
 * pisaba lo que se estuviera escribiendo. Con el estado inicial leído de las
 * props y una `key` atada al valor guardado, el formulario solo vuelve a
 * empezar cuando el dato cambia de verdad.
 */
type PropsFormulario = {
  perfil: TenantProfile;
  guardando: boolean;
  guardar: (e: FormEvent, datos: Record<string, unknown>) => void;
};

function Identidad({ perfil, guardando, guardar }: PropsFormulario) {
  const [nombre, setNombre] = useState(perfil.name);

  return (
    <form
      onSubmit={(e) => guardar(e, { name: nombre.trim() })}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div className="grid gap-2">
        <Label htmlFor="nombre">Nombre comercial</Label>
        <Input
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          minLength={2}
          required
        />
        <p className="text-xs text-muted-foreground">
          El que ven tus clientes en el rastreo público y en los avisos.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="slug">Tu dirección de acceso</Label>
        <Input id="slug" value={perfil.slug} readOnly disabled />
        {/* El slug es la URL por la que entra todo el equipo y va dentro de los
            enlaces de rastreo ya enviados. Cambiarlo rompe los dos, así que no
            es un campo de formulario. */}
        <p className="text-xs text-muted-foreground">
          Es la dirección por la que entra tu equipo. No se cambia: rompería los
          enlaces de rastreo ya enviados.
        </p>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium leading-none">Plan</p>
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/10 text-primary">{perfil.plan}</Badge>
          <Link
            href="/billing"
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            Ver facturación
          </Link>
        </div>
      </div>

      <div className="flex items-end sm:col-span-2">
        <Button
          type="submit"
          disabled={guardando || nombre.trim() === perfil.name}
        >
          Guardar
        </Button>
      </div>
    </form>
  );
}

function Volumetrico({ perfil, guardando, guardar }: PropsFormulario) {
  const [divisor, setDivisor] = useState(String(perfil.volumetricDivisor));

  return (
    <form
      onSubmit={(e) => guardar(e, { volumetricDivisor: Number(divisor) })}
      className="grid gap-4"
    >
      <p className="max-w-2xl text-sm text-muted-foreground">
        El peso que se cobra es el mayor entre el peso real y el volumétrico, y
        el volumétrico sale de{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          largo × ancho × alto (cm) ÷ divisor
        </code>
        . Cuanto más bajo el divisor, más pesa un bulto grande y ligero.
      </p>

      <div className="grid max-w-xs gap-2">
        <Label htmlFor="divisor">Divisor</Label>
        <Input
          id="divisor"
          type="number"
          inputMode="numeric"
          min={1000}
          max={10000}
          step={100}
          value={divisor}
          onChange={(e) => setDivisor(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          5000 es lo habitual en carga aérea; algunos couriers usan 6000. Entre
          1000 y 10000.
        </p>
      </div>

      {/* El aviso va aquí y no en un `confirm`: no es una acción peligrosa, es
          una que tiene un efecto que no se ve desde esta pantalla. Quien lo
          cambia tiene que saber que los envíos ya pesados no se recalculan. */}
      <p className="max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
        Cambiarlo afecta a lo que se pese <strong>a partir de ahora</strong>.
        Los bultos ya recibidos conservan el peso cobrable con el que se
        calcularon, igual que las reglas de aduana: el histórico no se reescribe.
      </p>

      <div>
        <Button
          type="submit"
          disabled={
            guardando ||
            divisor === String(perfil.volumetricDivisor) ||
            !divisor
          }
        >
          Guardar divisor
        </Button>
      </div>
    </form>
  );
}
