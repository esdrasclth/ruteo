import type { Metadata } from "next";
import type { ComponentType, ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  Bell,
  Check,
  ClipboardList,
  CreditCard,
  Landmark,
  MapPin,
  MessageSquareWarning,
  Package,
  PackageCheck,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FlightScene } from "@/components/flight-scene";
import { TrackingPreview } from "@/components/tracking-preview";
import { Reveal } from "@/components/reveal";
import { APP } from "@/lib/app-url";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Ruteo — Casillero, aduana y última milla en una sola operación",
  description:
    "Plataforma de envíos para couriers y casilleros que traen paquetes del extranjero a Honduras. Rastreo por tramos, aduana, manifiestos, rutas, cobro contra entrega, posventa y API.",
};

// --- piezas de composición ---------------------------------------------------

function Seccion({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    // scroll-mt: el encabezado es fijo y sin este margen el salto por ancla
    // deja el título de la sección debajo de la barra.
    <section id={id} className={cn("scroll-mt-20 py-20 sm:py-28", className)}>
      <Reveal className="mx-auto w-full max-w-[90rem] px-5 sm:px-8">
        {children}
      </Reveal>
    </section>
  );
}

// Antetítulo con una regla corta a la izquierda. Sustituye a la píldora de
// color que suele ir aquí: pesa menos y no mete un tercer tono a la paleta.
function Antetitulo({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-primary/70">
      <span className="h-px w-6 bg-primary/30" />
      {children}
    </p>
  );
}

function TituloSeccion({
  antetitulo,
  titulo,
  descripcion,
  className,
}: {
  antetitulo: string;
  titulo: ReactNode;
  descripcion?: ReactNode;
  className?: string;
}) {
  return (
    // El titular puede correr más ancho porque es tipografía grande; la
    // descripción no le sigue, y se queda en su propia medida. Un párrafo de
    // 15px a 900 px de ancho pasa de 100 caracteres por línea y se lee peor
    // cuanto más espacio le das.
    <div className={cn("max-w-4xl", className)}>
      <Antetitulo>{antetitulo}</Antetitulo>
      <h2 className="mt-5 text-3xl font-semibold leading-[1.15] tracking-tight text-primary text-balance sm:text-[2.5rem]">
        {titulo}
      </h2>
      {descripcion ? (
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {descripcion}
        </p>
      ) : null}
    </div>
  );
}

// --- datos de la página ------------------------------------------------------

const MODULOS: {
  icon: ComponentType<{ className?: string }>;
  titulo: string;
  texto: string;
}[] = [
  {
    icon: Archive,
    titulo: "Casilleros",
    texto:
      "Cada cliente recibe una dirección propia en las bodegas que operes: Miami, Madrid, Shenzhen o Panamá. Cuando llega un paquete se registra y sale la pre-alerta, antes de que pregunte.",
  },
  {
    icon: Package,
    titulo: "Envíos y etiquetas",
    texto:
      "Alta individual o importación por CSV, etiqueta con código de barras y número de guía propio. Ningún envío se salta pasos: solo se admite el siguiente estado válido.",
  },
  {
    icon: PackageCheck,
    titulo: "Recepción en bodega",
    texto:
      "El bulto se registra al llegar con sus medidas, su peso volumétrico y sus fotos. Esa foto del primer día es lo que convierte un «llegó dañado» de la semana que viene en una discusión con datos.",
  },
  {
    icon: RouteIcon,
    titulo: "Rutas y repartidores",
    texto:
      "Paradas ordenadas sobre el mapa, con la ruta real por calles. Cada visita queda registrada —entregada o fallida, con su motivo, su firma y su foto— así que «se fue tres veces» es un dato y no un recuerdo.",
  },
  {
    icon: Landmark,
    titulo: "Aduana e impuestos",
    texto:
      "Las reglas se versionan por fecha, así que una liquidación vieja se sigue explicando con la regla que se le aplicó. El expediente guarda la factura y los permisos que esa regla exige.",
  },
  {
    icon: ClipboardList,
    titulo: "Manifiestos y excepciones",
    texto:
      "Se coteja lo que llegó contra lo que venía declarado, y las diferencias —un bulto de menos, un peso que no cuadra— se abren solas como excepción en vez de quedarse en la memoria de quien descargó.",
  },
  {
    icon: CreditCard,
    titulo: "Cobros y COD",
    texto:
      "El contra entrega se registra por repartidor: lo cobrado, lo pendiente y lo ya remitido cuadran por período. Los cargos separan tu ingreso del tributo que solo trasladas.",
  },
  {
    icon: MessageSquareWarning,
    titulo: "Posventa",
    texto:
      "Reclamos, devoluciones y reembolsos. Lo que el cliente reclama, la mercancía que vuelve y el dinero que se devuelve son tres cosas distintas, y aquí se registran como tales.",
  },
  {
    icon: Bell,
    titulo: "Avisos y auditoría",
    texto:
      "Cada cambio de estado dispara el aviso al destinatario y deja rastro de quién lo hizo, cuándo y desde dónde.",
  },
];

const TRAMOS: { label: string; nota: string; destacado?: boolean }[] = [
  { label: "Bodega de origen", nota: "Recibido" },
  { label: "Consolidado", nota: "Agrupado" },
  { label: "Tránsito", nota: "Aéreo o marítimo" },
  { label: "Aduana HN", nota: "Impuestos", destacado: true },
  { label: "Liberado", nota: "Sin retención" },
  { label: "Bodega HN", nota: "En destino" },
  { label: "En reparto", nota: "Última milla" },
  { label: "Entregado", nota: "Con prueba" },
];

const KPIS = [
  { label: "Envíos", valor: "1,284", nota: "1,238 entregados" },
  { label: "Tasa de entrega", valor: "96.4%", nota: "46 intentos fallidos" },
  { label: "COD cobrado", valor: "L 84,320", nota: "Pendiente: L 6,150" },
  { label: "Avisos", valor: "3,910", nota: "12 fallidos" },
];

// Alturas de la maqueta del gráfico. Van a mano y no aleatorias para que el
// perfil tenga la forma de una operación real —valles de fin de semana— en vez
// de un serrucho uniforme.
const BARRAS = [
  38, 52, 61, 47, 70, 26, 18, 55, 66, 74, 58, 81, 34, 22, 63, 77, 69, 88, 45,
  30,
];

const PLANES: {
  nombre: string;
  precio: string;
  envios: string;
  incluye: string[];
  destacado?: boolean;
  ventas?: boolean;
}[] = [
  {
    nombre: "Free",
    precio: "L 0",
    envios: "50 envíos al mes",
    // Ya no dice «1 usuario»: no existe tal límite en el producto, y encima
    // contradecía el titular de esta misma sección («no por asiento»).
    incluye: ["Envíos y clientes", "Rastreo público", "Avisos automáticos"],
  },
  {
    nombre: "Starter",
    precio: "L 490",
    envios: "500 envíos al mes",
    incluye: [
      "Rutas y repartidores",
      "Recepción en bodega",
      "Zonas y tarifas",
      "Llaves de API y webhooks",
    ],
  },
  {
    nombre: "Pro",
    precio: "L 1,490",
    envios: "5,000 envíos al mes",
    // Antes listaba «Webhooks, CSV, COD» y se dejaba fuera lo que de verdad
    // abre este plan: casilleros y aduana, que son el motivo por el que
    // alguien llega a esta página.
    incluye: [
      "Casilleros y aduana",
      "Manifiestos y excepciones",
      "Cobros y posventa",
      "Auditoría",
    ],
    destacado: true,
  },
  {
    nombre: "Enterprise",
    precio: "L 4,990",
    envios: "Envíos ilimitados",
    incluye: ["Los 17 módulos", "Soporte dedicado"],
    ventas: true,
  },
];

const PREGUNTAS: { p: string; r: string }[] = [
  {
    p: "¿El casillero tiene que estar en Estados Unidos?",
    r: "No. Abres bodegas de origen donde las tengas —Miami, Madrid, Shenzhen, Panamá— y el envío arranca en la que le toque. Lo que Ruteo da por fijo es el destino: la aduana y el reparto que gestiona son los de Honduras.",
  },
  {
    p: "¿Sirve si solo hago reparto local?",
    r: "Sí. El envío local tiene su propio flujo, de creado a entregado, sin casillero ni aduana de por medio. El internacional se activa por envío, no por cuenta.",
  },
  {
    p: "¿Mis clientes necesitan una cuenta para rastrear?",
    r: "No. Con el número de guía ven el recorrido, el tramo actual y la fecha estimada. La consulta pública nunca expone datos personales del destinatario.",
  },
  {
    p: "¿Cómo se separan los datos entre empresas?",
    r: "Cada empresa queda aislada del resto, y el filtro vive en la base de datos con Row-Level Security de PostgreSQL. Que la aplicación filtre bien es la segunda línea de defensa, no la única.",
  },
  {
    p: "¿Puedo traer los envíos que ya tengo?",
    r: "Sí, por importación CSV. La carga valida fila por fila y te devuelve los errores con su número de línea, en vez de dejar el lote a medias.",
  },
  {
    p: "¿Qué pasa si un paquete se queda retenido en aduana?",
    r: "Pasa a retenido, deja de avanzar y el estado se ve tanto en el panel como en el rastreo público. Al liberarlo retoma el recorrido en el tramo que le tocaba.",
  },
  {
    p: "¿Y cuando un paquete llega roto o el cliente no lo quiere?",
    r: "Eso es posventa, y son tres cosas distintas a propósito. Un reclamo es lo que pide quien recibe; una devolución mueve la mercancía de vuelta —a sucursal, al remitente o al proveedor— y guarda cuántas veces se intentó entregar antes; un reembolso mueve el dinero contra el cobro original. El envío conserva su número de guía al devolverse: quien pregunte por él sigue teniendo el mismo.",
  },
  {
    p: "¿Se integra con mi tienda o mi ERP?",
    r: "Por API REST con llave por comercio y webhooks firmados. Los endpoints que crean recursos aceptan Idempotency-Key, así que reintentar nunca duplica un envío.",
  },
];

// --- datos estructurados -----------------------------------------------------

// Las preguntas del marcado salen del MISMO array que se pinta arriba. Es
// deliberado: si el JSON-LD declara preguntas que no están visibles en la
// página, Google lo trata como marcado engañoso y puede caer una acción
// manual. Generándolo desde la fuente no pueden separarse nunca.
const DATOS_ESTRUCTURADOS = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organizacion`,
      name: "Ruteo",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
      description:
        "Plataforma de envíos para couriers y casilleros que traen paquetes del extranjero a Honduras.",
      areaServed: { "@type": "Country", name: "Honduras" },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#sitio`,
      url: SITE_URL,
      name: "Ruteo",
      inLanguage: "es",
      publisher: { "@id": `${SITE_URL}/#organizacion` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#preguntas`,
      mainEntity: PREGUNTAS.map((q) => ({
        "@type": "Question",
        name: q.p,
        acceptedAnswer: { "@type": "Answer", text: q.r },
      })),
    },
  ],
};

// `<` escapado: si algún texto llegara a contener `</script>` cerraría la
// etiqueta antes de tiempo y el resto del JSON acabaría como HTML en la página.
const JSON_LD = JSON.stringify(DATOS_ESTRUCTURADOS).replace(/</g, "\\u003c");

// --- página ------------------------------------------------------------------

export default function LandingPage() {
  return (
    // `relative` + el `z-10` del contenido dejan al lienzo del vuelo en su
    // propio plano: por encima del fondo de la página y por debajo de todo lo
    // que hay que leer. Las tarjetas son de vidrio, así que el avión se
    // adivina al pasar por detrás en vez de desaparecer.
    <div className="landing-surface relative flex min-h-screen flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON_LD }}
      />
      <FlightScene />
      <SiteHeader />

      <main className="relative z-10 flex-1">
        {/* --- Hero --- */}
        {/* `-mt-16` mete el hero DEBAJO de la barra (que mide h-16) para que la
            foto llegue hasta el borde superior de la ventana. Sin esto la barra
            transparente deja ver una banda blanca en lugar de la imagen, y el
            efecto no se entiende. El relleno superior compensa esos 64 px para
            que el antetítulo no acabe tapado. */}
        <section className="landing-hero -mt-16">
          <div className="mx-auto w-full max-w-[90rem] px-5 pb-20 pt-32 sm:px-8 sm:pb-28 sm:pt-40">
            <div className="grid items-center gap-12 sm:gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
              <div>
                <Antetitulo>Casillero internacional → Honduras</Antetitulo>

                {/* 2.1rem en móvil: a 2.5rem el titular se comía seis líneas en
                    una pantalla de 390 px y empujaba los botones fuera de la
                    primera pantalla, que es donde tienen que estar. */}
                <h1 className="mt-5 text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.03em] text-primary text-balance sm:mt-6 sm:text-[3.25rem] sm:leading-[1.06] lg:text-[3.5rem]">
                  Deja de contestar &laquo;¿dónde viene mi paquete?&raquo;
                </h1>

                <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
                  Ruteo conecta tus bodegas en el extranjero, la aduana en
                  Honduras y el reparto a domicilio en una sola operación. Cada
                  envío avanza por tramos con hitos, mapa y fecha estimada, y tu
                  cliente lo sigue con su número de guía.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-center">
                  <Button asChild size="lg" className="h-11 px-6">
                    <a href={APP.register}>
                      Crear cuenta
                      <ArrowRight className="size-4" />
                    </a>
                  </Button>
                  {/* El vidrio en vez del contorno estándar: el botón cae sobre
                      la foto y un borde plano se perdía contra el cielo. */}
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="glass-card h-11 border-transparent px-6 text-primary hover:bg-white"
                  >
                    <a href={APP.track}>Rastrear una guía</a>
                  </Button>
                </div>

                <p className="mt-6 text-sm text-muted-foreground">
                  Sin tarjeta. El plan gratuito cubre 50 envíos al mes, y los de
                  pago se prueban 14 días.
                </p>
              </div>

              <div className="lg:pl-4">
                <TrackingPreview />
              </div>
            </div>
          </div>
        </section>

        {/* --- Franja de hechos ---
            Cuatro datos verificables del producto, no métricas de tracción:
            una cifra de clientes inventada es lo primero que huele a relleno. */}
        <Reveal className="mx-auto w-full max-w-[90rem] px-5 sm:px-8">
          <div className="rule-fade" />
          <dl className="grid grid-cols-2 gap-y-8 py-10 lg:grid-cols-4">
            {[
              { d: "16", t: "estados de envío modelados" },
              { d: "2", t: "flujos: local e internacional" },
              { d: "8", t: "tramos del trayecto internacional" },
              { d: "1", t: "número de guía, sin cuenta ni app" },
            ].map((f) => (
              <div key={f.t} className="px-1">
                <dt className="font-mono text-2xl font-semibold tabular-nums text-primary">
                  {f.d}
                </dt>
                <dd className="mt-1.5 max-w-[18rem] text-sm leading-snug text-muted-foreground">
                  {f.t}
                </dd>
              </div>
            ))}
          </dl>
          <div className="rule-fade" />
        </Reveal>

        {/* --- Módulos --- */}
        <Seccion id="operacion">
          <TituloSeccion
            antetitulo="La operación completa"
            titulo="Una operación, no cinco herramientas sueltas"
            descripcion="La hoja de cálculo del casillero, el grupo de WhatsApp de los repartidores y el cuaderno de los cobros describen el mismo paquete tres veces. Aquí se describe una sola vez."
          />

          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {MODULOS.map(({ icon: Icon, titulo, texto }) => (
              // Sin caja: icono, título y texto sobre el lienzo. Seis tarjetas
              // idénticas convierten esta sección en un muro de bordes.
              <div key={titulo}>
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10">
                  <Icon className="size-[18px]" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-primary">
                  {titulo}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {texto}
                </p>
              </div>
            ))}
          </div>
        </Seccion>

        {/* --- Trayecto internacional --- */}
        <Seccion id="internacional">
          <TituloSeccion
            antetitulo="Envío internacional"
            titulo="El trayecto entero, tramo por tramo"
            descripcion="Un envío que cruza una frontera no es un estado: son ocho. Ruteo lo modela como un viaje por tramos, cada uno con su ubicación, su hito y su fecha estimada, salga de Miami o de Shenzhen."
          />

          <div className="panel-solid mt-14 rounded-3xl p-7 sm:p-10">
            <ol className="grid grid-cols-2 gap-y-9 sm:grid-cols-4 lg:grid-cols-8">
              {TRAMOS.map((t, i) => (
                <li key={t.label} className="relative pr-4 lg:pr-3">
                  {/* La regla se dibuja por tramo y solo a partir de lg: en dos
                      o cuatro columnas se cortaría al final de cada fila y
                      sugeriría un salto que el recorrido no tiene. */}
                  {i < TRAMOS.length - 1 ? (
                    <span className="absolute left-3 right-0 top-[5px] hidden h-px bg-primary/18 lg:block" />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-10 block size-[11px] rounded-full",
                      t.destacado
                        ? "bg-primary ring-4 ring-primary/12"
                        : "bg-white ring-1 ring-primary/30",
                    )}
                  />
                  {/* Alto reservado para dos líneas: «Bodega de origen» es el
                      único rótulo que parte, y sin la reserva su nota caía un
                      renglón por debajo de las otras siete. Solo desde `sm`:
                      en móvil son dos columnas anchas donde nada parte, y el
                      hueco dejaba las notas flotando lejos del rótulo. */}
                  <p
                    className={cn(
                      "mt-4 text-sm sm:min-h-[2.5em]",
                      t.destacado
                        ? "font-semibold text-primary"
                        : "font-medium text-foreground/85",
                    )}
                  >
                    {t.label}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                    {t.nota}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-10 grid gap-8 border-t border-primary/8 pt-8 sm:grid-cols-3">
              {[
                {
                  icon: MapPin,
                  t: "Mapa del recorrido",
                  d: "Origen, destino y el punto donde va ahora, sobre el mapa y no en una lista de códigos.",
                },
                {
                  icon: Landmark,
                  t: "Aduana con cifras",
                  d: "Impuestos calculados con la regla vigente ese día, y el expediente con la factura y los permisos que exige.",
                },
                {
                  icon: Bell,
                  t: "Aviso por hito",
                  d: "Llegó a bodega, salió del país de origen, entró en aduana, quedó liberado. Cada uno se avisa.",
                },
              ].map(({ icon: Icon, t, d }) => (
                <div key={t} className="flex gap-3.5">
                  <Icon className="mt-0.5 size-[18px] shrink-0 text-primary/70" />
                  <div>
                    <p className="text-sm font-semibold text-primary">{t}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {d}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Seccion>

        {/* --- Panel --- */}
        <Seccion id="panel">
          <div className="grid items-center gap-14 lg:grid-cols-[0.85fr_1.15fr]">
            <TituloSeccion
              antetitulo="Para tu equipo"
              titulo="El día se ve entero desde una pantalla"
              descripcion="Arriba, lo que hay que atender ahora: qué está parado en aduana, qué excepciones no tienen dueño, qué sale a reparto. Abajo, cómo fue el período. Y cada cifra enlaza a la lista que la explica: ver «46 intentos fallidos» y no poder abrirlos es lo que hace que nadie entre al panel dos veces."
              className="max-w-none"
            />

            <div className="glass-solid overflow-hidden rounded-3xl">
              {/* Maqueta del panel. Barra superior, tarjetas de indicador y el
                  gráfico de envíos por día, en el mismo orden que la pantalla
                  real: la captura tiene que reconocerse al entrar. */}
              <div className="flex items-center gap-2.5 border-b border-primary/8 bg-white/60 px-5 py-3">
                <span className="size-2 rounded-full bg-primary/15" />
                <span className="size-2 rounded-full bg-primary/15" />
                <span className="size-2 rounded-full bg-primary/15" />
                <span className="ml-3 text-xs text-muted-foreground">
                  Dashboard · Últimos 30 días
                </span>
              </div>

              <div className="p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {KPIS.map((k) => (
                    <div
                      key={k.label}
                      className="rounded-xl bg-white/70 p-3.5 ring-1 ring-primary/8"
                    >
                      {/* Altura fija: «Tasa de entrega» ocupa dos líneas y sin
                          reserva las cifras de las cuatro tarjetas dejaban de
                          compartir línea base. */}
                      <p className="flex min-h-8 text-[10px] font-medium uppercase leading-tight tracking-[0.1em] text-muted-foreground">
                        {k.label}
                      </p>
                      <p className="mt-2 text-xl font-semibold tracking-tight text-primary tabular-nums">
                        {k.valor}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {k.nota}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl bg-white/70 p-4 ring-1 ring-primary/8">
                  <p className="text-xs font-semibold text-primary">
                    Envíos por día
                  </p>
                  <div
                    className="mt-4 flex h-28 items-end gap-[3px]"
                    aria-hidden="true"
                  >
                    {BARRAS.map((h, i) => (
                      <span
                        key={i}
                        style={{ height: `${h}%` }}
                        className={cn(
                          "flex-1 rounded-t-[2px]",
                          i >= BARRAS.length - 3
                            ? "bg-primary"
                            : "bg-primary/25",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Seccion>

        {/* --- API --- */}
        <Seccion id="api">
          <div className="grid items-start gap-14 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <TituloSeccion
                antetitulo="Para desarrolladores"
                titulo="Una API que puedes reintentar sin miedo"
                descripcion="REST documentada con OpenAPI, llave por comercio y webhooks firmados con HMAC-SHA256. Los endpoints que crean recursos aceptan Idempotency-Key: si la red se cae a medias, el reintento devuelve el mismo envío en vez de crear otro."
                className="max-w-none"
              />

              <ul className="mt-8 flex flex-col gap-3">
                {[
                  "Llaves por comercio, revocables y con alcance: solo lectura de envíos, o también casilleros",
                  "Firma x-ruteo-signature en cada entrega",
                  "Reintentos con espera creciente ante un 5xx",
                  "Eventos en vivo por WebSocket para el mapa",
                ].map((t) => (
                  <li
                    key={t}
                    className="flex items-start gap-3 text-sm text-foreground/85"
                  >
                    <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Bloque de código claro, no terminal oscura: el resto de la
                página es clara y una caja negra aquí partiría la lectura.

                `min-w-0` no es decorativo: por defecto una celda de rejilla no
                se encoge por debajo del ancho mínimo de su contenido, y las
                líneas de código no se parten. Sin esto la columna se plantaba
                en el ancho del `pre` y arrastraba a TODA la página a un scroll
                horizontal de 13 px en móvil. */}
            <div className="flex min-w-0 flex-col gap-4">
              <Fragmento
                titulo="Crear un envío"
                metodo="POST"
                ruta="/shipments"
                lineas={[
                  ["h", "Idempotency-Key: 6f1c9a3e-4b2d-4f01-9a77-2c8b1d0e5f34"],
                  ["p", "{"],
                  ["k", '  "type"', '"INTERNATIONAL"'],
                  ["k", '  "recipientName"', '"María Rodríguez"'],
                  ["k", '  "originLabel"', '"Miami warehouse, FL"'],
                  ["k", '  "destinationLabel"', '"Tegucigalpa, HN"'],
                  ["n", '  "weightKg"', "12.4"],
                  ["n", '  "codAmount"', "1850.00"],
                  ["p", "}"],
                ]}
              />

              <Fragmento
                titulo="Recibir el cambio de estado"
                metodo="POST"
                ruta="https://tu-erp.com/hooks/ruteo"
                lineas={[
                  ["h", "x-ruteo-signature: sha256=9d4f…"],
                  ["p", "{"],
                  ["k", '  "event"', '"shipment.status_changed"'],
                  ["p", '  "data": {'],
                  ["k", '    "trackingNumber"', '"RUT-8K3P2M4Q7B"'],
                  ["k", '    "status"', '"CUSTOMS_CLEARED"'],
                  ["p", "  }"],
                  ["p", "}"],
                ]}
              />
            </div>
          </div>
        </Seccion>

        {/* --- Precios --- */}
        <Seccion id="precios">
          <TituloSeccion
            antetitulo="Precios"
            titulo="Se paga por volumen, no por asiento"
            descripcion="Tu equipo entero entra en cualquier plan. Lo que cambia es cuántos envíos mueves al mes y qué módulos necesitas."
          />

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANES.map((plan) => (
              <div
                key={plan.nombre}
                className={cn(
                  "glass-solid flex flex-col rounded-2xl p-6",
                  // El plan destacado no cambia de color: se adelanta con un
                  // aro y una sombra más profunda. Pintarlo de otro tono
                  // rompía la única regla cromática de la página.
                  plan.destacado &&
                    "ring-1 ring-primary/15 shadow-[0_1px_2px_rgba(4,21,31,0.05),0_28px_56px_-32px_rgba(4,21,31,0.4)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-primary">
                    {plan.nombre}
                  </p>
                  {plan.destacado ? (
                    <span className="rounded-full bg-primary/8 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-primary">
                      Recomendado
                    </span>
                  ) : null}
                </div>

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight text-primary tabular-nums">
                    {plan.precio}
                  </span>
                  <span className="text-sm text-muted-foreground">/mes</span>
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {plan.envios}
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {plan.incluye.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm leading-snug text-foreground/85"
                    >
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-primary"
                        strokeWidth={2.5}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.destacado ? "default" : "outline"}
                  className="mt-7 w-full"
                >
                  <a href={plan.ventas ? APP.sales : APP.register}>
                    {plan.ventas ? "Hablar con ventas" : "Empezar gratis"}
                  </a>
                </Button>
              </div>
            ))}
          </div>

          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            Precios en lempiras, sin impuestos. Los planes de pago empiezan con
            14 días de prueba y sin tarjeta. Se cambia de plan cuando quieras y
            el límite cuenta por período de facturación.
          </p>
        </Seccion>

        {/* --- Preguntas --- */}
        <Seccion>
          <div className="grid gap-14 lg:grid-cols-[0.7fr_1.3fr]">
            <TituloSeccion
              antetitulo="Preguntas"
              titulo="Lo que suelen preguntar antes de migrar"
              className="max-w-none"
            />

            <dl className="grid gap-x-12 gap-y-9 sm:grid-cols-2">
              {PREGUNTAS.map((q) => (
                <div key={q.p}>
                  <dt className="text-sm font-semibold text-primary">{q.p}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {q.r}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Seccion>

        {/* --- Cierre ---
            El único bloque oscuro de la página. Con todo claro alrededor, es lo
            que hace que el último llamado a la acción no pase desapercibido. */}
        <Seccion className="pt-0">
          <div className="brand-dark overflow-hidden rounded-3xl px-7 py-14 sm:px-14">
            <div className="relative z-10 mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white text-balance sm:text-[2.5rem]">
                Que el próximo paquete se explique solo
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-white/60">
                Crea la cuenta de tu empresa, carga tus envíos y comparte la
                primera guía. El plan gratuito no pide tarjeta.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="auth-cta h-11 px-6 font-semibold hover:opacity-100"
                >
                  <a href={APP.register}>
                    Crear cuenta
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="h-11 px-6 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <a href={APP.track}>Ver el rastreo público</a>
                </Button>
              </div>
            </div>
          </div>
        </Seccion>
      </main>

      <SiteFooter />
    </div>
  );
}

// --- fragmento de código -----------------------------------------------------

// Las líneas llegan ya troceadas por tipo en vez de resaltarse con una regex:
// son dos ejemplos fijos y meter un resaltador de sintaxis en el bundle de una
// página de venta no se paga.
type Linea =
  | ["h", string] // cabecera HTTP
  | ["p", string] // puntuación o llave suelta
  | ["k", string, string] // clave y valor de texto
  | ["n", string, string]; // clave y valor numérico

function Fragmento({
  titulo,
  metodo,
  ruta,
  lineas,
}: {
  titulo: string;
  metodo: string;
  ruta: string;
  lineas: Linea[];
}) {
  return (
    <figure className="glass-solid overflow-hidden rounded-2xl">
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/8 bg-white/50 px-4 py-2.5">
        <span className="rounded bg-primary/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-primary">
          {metodo}
        </span>
        <span className="font-mono text-[11px] text-foreground/75">{ruta}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {titulo}
        </span>
      </figcaption>

      {/* 11 px en móvil: la línea más larga es una clave de idempotencia de 51
          caracteres, y a 12 px obliga a arrastrar el bloque de lado. */}
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[11px] leading-[1.75] sm:text-[12px]">
        <code>
          {lineas.map((linea, i) => {
            if (linea[0] === "h") {
              return (
                <div key={i} className="text-muted-foreground">
                  {linea[1]}
                </div>
              );
            }
            if (linea[0] === "p") {
              return (
                <div key={i} className="text-foreground/60">
                  {linea[1]}
                </div>
              );
            }
            const [tipo, clave, valor] = linea;
            // La coma se omite cuando lo siguiente cierra el objeto: un ejemplo
            // de JSON que no compila es peor que no poner ejemplo.
            const siguiente = lineas[i + 1];
            const cierra =
              !siguiente ||
              (siguiente[0] === "p" && siguiente[1].trim().startsWith("}"));
            return (
              <div key={i}>
                <span className="text-primary">{clave}</span>
                <span className="text-foreground/60">: </span>
                <span
                  className={tipo === "n" ? "text-[#8a5a2b]" : "text-[#3f7d72]"}
                >
                  {valor}
                </span>
                {cierra ? null : <span className="text-foreground/60">,</span>}
              </div>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}
