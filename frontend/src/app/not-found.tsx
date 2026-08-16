import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 404 de todo lo que queda fuera del panel.
 *
 * Ofrece las dos salidas que de verdad se usan: entrar al panel, o consultar
 * una guía —que es a lo que llega la mayoría de quien teclea mal una URL de
 * este dominio, porque el enlace de rastreo es el que se comparte.
 */
export default function NoEncontrado() {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/5 text-primary/70 ring-1 ring-primary/10">
          <Compass className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-base font-semibold">Aquí no hay nada</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            La dirección no corresponde a ninguna pantalla. Puede que el enlace
            esté incompleto o que lo que buscabas se haya movido.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard">Ir al panel</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/track">Rastrear una guía</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
