"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmación de una acción que no se puede deshacer.
 *
 * Sustituye a `window.confirm`, que estaba en ocho acciones destructivas. El
 * problema no era solo estético —un cuadro gris del sistema operativo en medio
 * de un panel de vidrio—: el diálogo nativo **no dice qué se va a borrar con el
 * formato del producto**, no distingue una acción peligrosa de una normal, y en
 * varios navegadores se puede silenciar para el resto de la sesión, con lo que
 * la siguiente acción destructiva se ejecuta sin preguntar nada.
 *
 * Se expone como promesa a propósito, para que sustituya al nativo sin darle la
 * vuelta al flujo de quien lo llama:
 *
 *     if (!(await confirmar({ titulo: "¿Eliminar el tramo?" }))) return;
 *
 * El `Promise` se resuelve al pulsar, y con `false` si se cierra por fuera o
 * con Escape —que es lo mismo que hacía `window.confirm` al cancelar.
 */
export interface PeticionDeConfirmacion {
  titulo: string;
  descripcion?: ReactNode;
  /** Texto del botón que confirma. Por defecto, «Confirmar». */
  accion?: string;
  /** Pinta el botón en rojo. Para lo que borra o revoca. */
  peligro?: boolean;
}

type Confirmar = (peticion: PeticionDeConfirmacion) => Promise<boolean>;

const Contexto = createContext<Confirmar | null>(null);

export function useConfirmar(): Confirmar {
  const confirmar = useContext(Contexto);
  if (!confirmar) {
    throw new Error("useConfirmar necesita estar dentro de <ConfirmarProvider>");
  }
  return confirmar;
}

export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [peticion, setPeticion] = useState<PeticionDeConfirmacion | null>(null);
  // La función que resuelve la promesa en curso. En una ref y no en estado:
  // cambiarla no tiene que repintar nada, y guardarla en estado haría que el
  // diálogo se volviera a montar en mitad de la pregunta.
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>((nueva) => {
    return new Promise<boolean>((resolve) => {
      // Si ya había una pregunta abierta se cancela: dos diálogos encolados
      // dejarían al usuario contestando a algo que ya no está en pantalla.
      resolver.current?.(false);
      resolver.current = resolve;
      setPeticion(nueva);
    });
  }, []);

  const responder = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPeticion(null);
  }, []);

  return (
    <Contexto.Provider value={confirmar}>
      {children}

      <Dialog
        open={peticion !== null}
        // Cerrar por fuera, con Escape o con la X es cancelar.
        onOpenChange={(abierto) => {
          if (!abierto) responder(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{peticion?.titulo}</DialogTitle>
            {peticion?.descripcion ? (
              <DialogDescription>{peticion.descripcion}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => responder(false)}>
              Cancelar
            </Button>
            <Button
              variant={peticion?.peligro ? "destructive" : "default"}
              onClick={() => responder(true)}
            >
              {peticion?.accion ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Contexto.Provider>
  );
}
