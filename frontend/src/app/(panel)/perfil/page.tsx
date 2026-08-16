"use client";

import { useState } from "react";
import { BadgeCheck, Building2, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  api,
  ApiError,
  CurrentUser,
  getSession,
  setSession,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { avisarPerfilCambiado } from "@/lib/eventos";
import { ROLE_LABELS } from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangePasswordDialog } from "../change-password-dialog";
import { FotoDePerfil } from "./foto";

/**
 * Los datos de la persona que ha entrado.
 *
 * Hasta ahora no había dónde: el nombre lo ponía quien te dio de alta y sólo un
 * OWNER o ADMIN podía cambiarlo desde Equipo, así que corregir una tilde del
 * propio nombre exigía pedírselo a un jefe.
 *
 * **Lo editable es sólo el nombre**, y el resto se enseña en gris a propósito.
 * El rol no se cambia uno mismo —sería ascenderse—, y el correo es la
 * credencial: vive en ZITADEL y cambiarlo es re-verificarlo y decidir qué pasa
 * con la sesión abierta, o sea un flujo con su propia pantalla. Enseñarlos
 * bloqueados en vez de esconderlos responde la pregunta «¿con qué cuenta estoy
 * dentro?» sin obligar a buscarla.
 */
export default function PerfilPage() {
  // La MISMA clave que piden el armazón del panel (para el avatar) y la banda
  // de verificación. Al entrar aquí no se pide nada nuevo: ya está en caché.
  const { datos: yo, recargar } = useApi<CurrentUser>("/users/me", {
    mensajeDeError: "Error cargando tu perfil",
  });
  const [guardando, setGuardando] = useState(false);
  const sesion = getSession();

  // Escribe el usuario en la caché sin volver a pedirlo. Como la clave es
  // compartida, el avatar del menú lateral se entera en el acto.
  const fijarYo = (u: CurrentUser) => void recargar(u, { revalidate: false });

  async function guardar(nombre: string) {
    setGuardando(true);
    try {
      const actualizado = await api<CurrentUser>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name: nombre.trim() }),
      });
      fijarYo(actualizado);

      // La sesión guardada lleva una copia del nombre y es la que pinta el pie
      // del menú. Sin refrescarla, guardas el cambio, lo ves aquí y al mirar la
      // barra lateral sigue el nombre viejo hasta el próximo inicio de sesión.
      const s = getSession();
      if (s) setSession({ ...s, name: actualizado.name });
      avisarPerfilCambiado();

      toast.success("Perfil actualizado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mi perfil"
        description="Tus datos personales y el acceso a esta cuenta."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Datos personales</CardTitle>
          </CardHeader>
          <CardContent>
            {!yo ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <DatosPersonales
                key={yo.name ?? ""}
                yo={yo}
                guardando={guardando}
                guardar={guardar}
                fijarYo={fijarYo}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acceso</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div>
                  <p className="text-xs text-muted-foreground">Tu perfil</p>
                  <p className="text-sm font-medium">
                    {yo ? ROLE_LABELS[yo.role] : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Decide a qué pantallas entras. Lo cambia quien administra la
                    cuenta, desde Equipo.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Empresa</p>
                  <p className="truncate text-sm font-medium">
                    {sesion?.slug ?? "—"}
                  </p>
                  <Link
                    href="/empresa"
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Ver la ficha de la empresa
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contraseña</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <p className="text-sm text-muted-foreground">
                Cámbiala si crees que alguien más la conoce.
              </p>
              {/* El diálogo estaba suelto en el pie del menú, junto a «Cerrar
                  sesión». Ahí no lo encontraba quien lo buscaba: nadie va al
                  pie de una barra lateral a administrar su cuenta. */}
              <div className="flex">
                <ChangePasswordDialog />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notificaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                {/* Se dice lo que hay en vez de dejar la tarjeta fuera: quien
                    entra a su perfil buscando «avisos» necesita saber que la
                    respuesta es «todavía no», no quedarse buscando. */}
                Todavía no puedes elegir qué avisos recibes. Los mensajes que
                salen del sistema se ven en Notificaciones.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Los datos personales, aparte y con `key`.
 *
 * El nombre se rellenaba desde el mismo `useEffect` que traía el usuario, y eso
 * era un render en cascada además de una carrera: un refresco en segundo plano
 * pisaba lo que se estuviera escribiendo. Con el valor inicial leído de las
 * props y la `key` atada al nombre guardado, el campo solo vuelve a empezar
 * cuando el nombre cambia de verdad.
 */
function DatosPersonales({
  yo,
  guardando,
  guardar,
  fijarYo,
}: {
  yo: CurrentUser;
  guardando: boolean;
  guardar: (nombre: string) => void;
  fijarYo: (u: CurrentUser) => void;
}) {
  const [nombre, setNombre] = useState(yo.name ?? "");
  const sinCambios = (yo.name ?? "") === nombre.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar(nombre);
      }}
      className="grid gap-5"
    >
      {/* La foto va PRIMERO y fuera del formulario: se guarda sola al elegirla,
          no con el botón «Guardar» de abajo. Ponerla dentro haría pensar que
          hay que guardar dos veces. */}
      <FotoDePerfil yo={yo} onCambio={fijarYo} />

      <div className="grid gap-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          minLength={2}
          maxLength={120}
          required
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          Es el que ve tu equipo en la bitácora y en las pantallas donde queda
          registrado quién hizo qué.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="correo">Correo</Label>
        <div className="flex max-w-md flex-wrap items-center gap-2">
          <Input
            id="correo"
            value={yo.email}
            readOnly
            disabled
            className="flex-1"
          />
          {yo.emailVerified ? (
            <Badge className="bg-primary/10 text-primary">
              <BadgeCheck className="size-3" aria-hidden />
              Verificado
            </Badge>
          ) : (
            <Badge className="bg-amber-500/10 text-amber-700">
              <TriangleAlert className="size-3" aria-hidden />
              Sin verificar
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          El correo es tu credencial de acceso y no se cambia desde aquí.
          Escríbenos si necesitas moverlo a otra dirección.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={guardando || sinCambios}>
          Guardar
        </Button>
        {/* Deshabilitado sin cambios: un botón que siempre se puede pulsar
            invita a guardar por si acaso, y cada guardado es una escritura y un
            aviso de éxito que no dice nada. */}
        {sinCambios && (
          <span className="text-xs text-muted-foreground">
            No hay cambios que guardar.
          </span>
        )}
      </div>
    </form>
  );
}
