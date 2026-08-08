import Image from "next/image";
import { APP } from "@/lib/app-url";

const COLUMNAS: { titulo: string; enlaces: { href: string; label: string }[] }[] =
  [
    {
      titulo: "Producto",
      enlaces: [
        { href: "#operacion", label: "Operación" },
        { href: "#internacional", label: "Envío internacional" },
        { href: "#panel", label: "Panel" },
        { href: "#precios", label: "Precios" },
      ],
    },
    {
      titulo: "Desarrolladores",
      enlaces: [
        { href: "#api", label: "API REST" },
        { href: "#api", label: "Webhooks" },
        // La referencia OpenAPI la sirve el backend en /docs y su dominio
        // depende del despliegue: se enlaza cuando exista uno público, no a
        // un localhost que en producción no lleva a ninguna parte.
        { href: "#internacional", label: "Estados del envío" },
      ],
    },
    {
      titulo: "Cuenta",
      enlaces: [
        { href: APP.track, label: "Rastrear una guía" },
        { href: APP.login, label: "Iniciar sesión" },
        { href: APP.register, label: "Crear cuenta" },
      ],
    },
  ];

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-primary/8 bg-white/60">
      <div className="mx-auto w-full max-w-[90rem] px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Image
              src="/logo.svg"
              alt="Ruteo"
              width={120}
              height={32}
              className="h-8 w-auto"
            />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Casillero, aduana y última milla en una sola operación. Hecho para
              empresas que traen paquetes del extranjero a Honduras y los
              entregan puerta a puerta.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:gap-14">
            {COLUMNAS.map((col) => (
              <div key={col.titulo}>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary/70">
                  {col.titulo}
                </p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {col.enlaces.map((e) => (
                    <li key={`${col.titulo}-${e.label}`}>
                      {/* Todo lo de aquí es o un ancla de la propia página o una
                          ruta del panel, que es otro dominio. En ninguno de los
                          dos casos interviene el router. */}
                      <a
                        href={e.href}
                        className="rounded text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                      >
                        {e.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="rule-fade mt-12" />

        <div className="mt-6 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          {/* El crédito va junto al copyright y no como tercera columna: con
              tres bloques y `justify-between` la nota de precios acababa
              centrada, que es donde menos pinta. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p>© {new Date().getFullYear()} Ruteo. Tegucigalpa, Honduras.</p>
            <span
              aria-hidden
              className="hidden h-3 w-px bg-primary/15 sm:block"
            />
            <p>
              Desarrollado por{" "}
              <a
                href="https://www.brandsofts.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded font-medium text-primary/80 underline decoration-primary/25 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Brandsofts
              </a>
            </p>
          </div>
          <p>Precios en lempiras (HNL). Impuestos no incluidos.</p>
        </div>
      </div>
    </footer>
  );
}
