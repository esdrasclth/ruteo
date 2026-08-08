"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OtpInput } from "@/components/ui/otp-input";

// Espera entre reenvíos. Sin ella el botón invita a pulsarlo tres veces
// seguidas, y como cada código nuevo invalida el anterior, el usuario acaba
// con tres correos y ninguno que funcione: el que tiene a mano es el viejo.
const ESPERA_REENVIO_S = 60;

export function VerifyEmailDialog({
  email,
  open,
  onOpenChange,
  onVerificado,
}: {
  email: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onVerificado: () => void;
}) {
  const [code, setCode] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [espera, setEspera] = useState(0);
  // Cambia con cada fallo para remontar el campo: así el foco vuelve solo a la
  // primera casilla y se puede reintentar sin tocar el ratón.
  const [intento, setIntento] = useState(0);
  const [reenviando, setReenviando] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function verificar(codigo: string) {
    if (codigo.length < 6 || verificando) return;
    setVerificando(true);
    setError(null);
    try {
      await api("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ code: codigo }),
      });
      setHecho(true);
    } catch (err) {
      // El error se muestra DENTRO del diálogo y no como aviso flotante: el
      // usuario tiene que corregir aquí mismo, y un toast que se desvanece deja
      // el campo mal sin explicación a la vista.
      setError(
        err instanceof ApiError ? err.message : "No se pudo verificar el código",
      );
      setCode("");
      setIntento((n) => n + 1);
      setVerificando(false);
    }
  }

  async function reenviar() {
    setReenviando(true);
    try {
      await api("/auth/send-verification", { method: "POST" });
      setCode("");
      setIntento((n) => n + 1);
      setError(null);
      setEspera(ESPERA_REENVIO_S);
      toast.success(`Te enviamos un código nuevo a ${email}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo reenviar el código",
      );
    } finally {
      setReenviando(false);
    }
  }

  function cerrar(v: boolean) {
    onOpenChange(v);
    if (!v && hecho) onVerificado();
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        {hecho ? (
          <>
            <DialogHeader>
              <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/8">
                <CheckCircle2 className="size-5 text-primary" />
              </div>
              <DialogTitle>Correo verificado</DialogTitle>
              <DialogDescription>
                Confirmamos {email}. Ya puedes recuperar tu cuenta, invitar a tu
                equipo y crear llaves de API.
              </DialogDescription>
            </DialogHeader>
            <Button className="mt-2 w-full" onClick={() => cerrar(false)}>
              Listo
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/8">
                <MailCheck className="size-5 text-primary" />
              </div>
              <DialogTitle>Verifica tu correo</DialogTitle>
              <DialogDescription>
                Escribe el código de 6 dígitos que enviamos a{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-2">
              <OtpInput
                key={intento}
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (error) setError(null);
                }}
                // Al completar los seis dígitos se envía solo: pedir un clic
                // extra después de teclear el último es un paso de más.
                onComplete={verificar}
                disabled={verificando}
                autoFocus
              />

              {error ? (
                <p className="text-center text-sm text-destructive">{error}</p>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  Caduca a los 30 minutos. Si no lo ves, revisa el correo no
                  deseado.
                </p>
              )}
            </div>

            <Button
              className="w-full"
              disabled={code.length < 6 || verificando}
              onClick={() => verificar(code)}
            >
              {verificando ? "Verificando…" : "Verificar"}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              {espera > 0 ? (
                <span>Puedes pedir otro código en {espera}s</span>
              ) : (
                <button
                  type="button"
                  onClick={reenviar}
                  disabled={reenviando}
                  className="rounded font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary/60 disabled:opacity-50"
                >
                  {reenviando ? "Enviando…" : "Reenviar código"}
                </button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
