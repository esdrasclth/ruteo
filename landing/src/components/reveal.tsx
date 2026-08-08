"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Aparición al entrar en pantalla. Envuelve el CONTENEDOR de una sección, no
// cada pieza: la animación la reciben los hijos directos vía CSS (ver
// `.reveal` en globals.css), así el escalonado sale con `nth-child` y no hay
// que meter divs nuevos dentro de las rejillas, que es lo que las rompería.
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        setVisible(true);
        // Una sola vez: que la sección se desvanezca al volver a subir marea
        // y distrae, además de repetir la animación en cada rebote del scroll.
        io.disconnect();
      },
      // El margen inferior negativo retrasa el disparo hasta que la sección ha
      // entrado de verdad, no cuando asoma el primer píxel por el borde.
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "reveal-visible", className)}
    >
      {children}
    </div>
  );
}
