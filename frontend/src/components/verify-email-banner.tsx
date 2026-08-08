"use client";

import { useEffect, useState } from "react";
import { MailWarning, X } from "lucide-react";
import { api, CurrentUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { VerifyEmailDialog } from "@/components/verify-email-dialog";

// Aviso de correo sin verificar.
//
// La banda solo informa y ofrece UNA acción; el trabajo ocurre en su diálogo.
// Meter el campo del código aquí dentro obligaba a apretujar seis dígitos y dos
// botones en una franja horizontal, que es lo que hacía que pareciera un
// formulario de pruebas en vez de parte del producto.
//
// Es aviso y no bloqueo: la cuenta funciona desde el primer minuto y verificar
// puede esperar. Cortarle el paso a quien acaba de registrarse —por un correo
// que quizá tarde— es la forma más rápida de perderlo antes de que pruebe nada.
export function VerifyEmailBanner() {
  // Consulta su propio estado en vez de leer la sesión guardada: esa sesión se
  // escribe al entrar y no se refresca, así que tras verificar seguiría
  // diciendo que falta hasta el siguiente inicio de sesión.
  const [email, setEmail] = useState<string | null>(null);
  const [oculto, setOculto] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    api<CurrentUser>("/users/me")
      .then((me) => {
        if (vivo && me.emailVerified === false) setEmail(me.email);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  if (!email || oculto) return null;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12">
            <MailWarning className="size-4 text-amber-700" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Verifica tu correo para completar la cuenta
            </p>
            {/* Decir QUÉ se bloquea, no solo que falta un trámite: sin esto el
                aviso se ignora hasta el día que algo falla sin explicación. */}
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Sin verificar <span className="font-medium">{email}</span> no
              podrás recuperar la cuenta si olvidas la contraseña, ni invitar a
              tu equipo, ni crear llaves de API. Tu operación diaria no se ve
              afectada.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
          <Button size="sm" onClick={() => setAbierto(true)}>
            Verificar ahora
          </Button>
          <button
            type="button"
            onClick={() => setOculto(true)}
            aria-label="Ocultar aviso"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <VerifyEmailDialog
        email={email}
        open={abierto}
        onOpenChange={setAbierto}
        onVerificado={() => setEmail(null)}
      />
    </>
  );
}
