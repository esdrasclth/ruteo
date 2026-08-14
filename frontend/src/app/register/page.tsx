"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  api,
  setSession,
  ApiError,
  CurrentUser,
  Plan,
  PlanDefinition,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  AuthAside,
  AuthBack,
  AuthBrand,
  AuthHeading,
  AuthShell,
  AuthStepper,
  AuthSummary,
} from "@/components/auth-shell";

// NFD separa "í" en "i" + tilde combinante; \p{Mn} (marcas sin espaciado) borra
// esa tilde y deja la letra base. Así "Envíos Ñandú" da "envios-nandu" en vez de
// partirse en trozos al toparse con los caracteres no ASCII.
function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Mn}/gu, "");
}

// Espejo de las reglas del backend (RegisterDto): /^[a-z0-9-]+$/, 2 a 40.
function slugify(nombre: string): string {
  return sinAcentos(nombre)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

// Saneado suave para lo que se teclea a mano: conserva el guion final mientras
// se escribe. Con slugify puro no se podría escribir "mi-empresa" — el guion se
// borraría en la misma pulsación y la palabra quedaría pegada.
function slugTecleado(valor: string): string {
  return sinAcentos(valor)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40);
}

const TOTAL_PASOS = 3;

const ETIQUETA_PASO = ["Datos de la empresa", "Plan", "Tu cuenta"];

// Espejo de `DIAS_DE_PRUEBA` en el backend. Aquí es solo un texto: quien decide
// la fecha de fin es el backend al crear la suscripción, así que si se
// desincroniza se lee raro pero no se cobra ni se caduca nada distinto.
const DIAS_DE_PRUEBA_TEXTO = "14 días";

export default function RegisterPage() {
  const router = useRouter();
  const [paso, setPaso] = useState(1);
  const [tenantName, setTenantName] = useState("");
  const [slug, setSlug] = useState("");
  // El autocompletado se apaga en cuanto el usuario escribe su propio slug, para
  // no pisarle lo que eligió si después retoca el nombre de la empresa.
  const [slugManual, setSlugManual] = useState(false);
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<Plan>("FREE");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // El catálogo se lee de la API y no se copia aquí: con los precios duplicados
  // en el frontend, cambiar uno en `plans.ts` deja el registro vendiendo el
  // precio viejo. Si la petición falla, el paso del plan se salta solo y la
  // cuenta se crea en FREE: quedarse sin poder registrarse porque no cargó una
  // tabla de precios sería lo peor de los dos mundos.
  const [planes, setPlanes] = useState<PlanDefinition[] | null>(null);
  useEffect(() => {
    void api<PlanDefinition[]>("/plans")
      .then(setPlanes)
      .catch(() => setPlanes([]));
  }, []);

  const elegido = planes?.find((p) => p.plan === plan);

  function onNombreChange(valor: string) {
    setTenantName(valor);
    if (!slugManual) setSlug(slugify(valor));
  }

  function onSlugChange(valor: string) {
    // Vaciar el campo devuelve el control al automático: es la forma natural de
    // decir "mejor generalo vos" sin tener que recargar la página.
    if (valor.trim() === "") {
      setSlugManual(false);
      setSlug(slugify(tenantName));
      return;
    }
    setSlugManual(true);
    setSlug(slugTecleado(valor));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Los submits intermedios solo avanzan; así la validación nativa del
    // navegador corre sobre los campos visibles y no sobre los que aún no
    // existen.
    if (paso === 1) {
      const limpio = slugify(slug);
      if (limpio.length < 2) {
        toast.error("El identificador necesita al menos 2 caracteres");
        return;
      }
      setSlug(limpio);
      // Sin catálogo no hay nada que elegir: se salta al paso de la cuenta y se
      // crea en FREE.
      setPaso(planes && planes.length > 0 ? 2 : 3);
      return;
    }

    if (paso === 2) {
      setPaso(3);
      return;
    }

    const slugFinal = slugify(slug);
    setLoading(true);
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            tenantName,
            slug: slugFinal,
            phone,
            email,
            password,
            plan,
          }),
        },
      );
      // Persist tokens first so the /users/me request is authenticated.
      setSession({
        ...tokens,
        slug: slugFinal,
        email,
        userId: "",
        name: null,
        role: "OWNER",
      });
      const me = await api<CurrentUser>("/users/me");
      setSession({
        ...tokens,
        slug: slugFinal,
        email: me.email,
        userId: me.id,
        name: me.name,
        role: me.role,
      });
      router.replace("/dashboard");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo registrar",
      );
      // Un slug repetido o un correo inválido se corrigen en el paso 1: devolver
      // al usuario ahí evita que se quede mirando un error que no puede arreglar
      // desde la pantalla en la que está.
      setLoading(false);
    }
  }

  const resumen = [
    { label: "Empresa", value: tenantName || "—" },
    {
      label: "Identificador",
      value: slug ? <span className="font-mono text-xs">{slug}</span> : "—",
    },
    { label: "Teléfono", value: phone || "—" },
    { label: "Propietario", value: email || "—" },
  ];

  const esDePago = (elegido?.monthlyAmount ?? 0) > 0;

  return (
    <AuthShell
      stepper={
        <AuthStepper
          paso={paso}
          total={TOTAL_PASOS}
          etiqueta={ETIQUETA_PASO[paso - 1]}
        />
      }
      aside={
        <AuthAside
          title="Empieza a operar hoy mismo"
          description="Creas la cuenta de tu empresa y entras directo al panel. Sin instalación y sin tarjeta."
          bullets={[
            "Tus datos quedan aislados del resto de empresas",
            "Invitas a tu equipo con permisos por rol",
            "Cambias de plan cuando crezcas",
          ]}
        >
          <AuthSummary
            title="Tu cuenta"
            chips={[
              elegido ? `Plan ${elegido.name}` : "Plan Free",
              esDePago ? "Prueba de 14 días" : "Propietario",
            ]}
            rows={resumen}
            total={{
              label: "Incluye",
              value:
                elegido?.shipmentLimit === null
                  ? "Envíos sin límite"
                  : `${(elegido?.shipmentLimit ?? 50).toLocaleString("es-HN")} envíos/mes`,
            }}
          />
        </AuthAside>
      }
    >
      <AuthBrand />

      {paso > 1 ? (
        <AuthBack onClick={() => setPaso(paso - 1)}>
          {ETIQUETA_PASO[paso - 2]}
        </AuthBack>
      ) : (
        <AuthBack href="/login">Volver a iniciar sesión</AuthBack>
      )}

      {paso === 1 ? (
        <AuthHeading
          title="Cuéntanos de tu empresa"
          description="El identificador es el nombre corto con el que tu equipo entrará al panel."
        />
      ) : paso === 2 ? (
        <AuthHeading
          title="¿Con qué plan empiezas?"
          description="Puedes cambiarlo cuando quieras. Ninguno pide tarjeta ahora."
        />
      ) : (
        <AuthHeading
          title="Ya casi terminamos"
          description="Solo falta tu acceso. Esta será la cuenta propietaria, con control total sobre la empresa."
        />
      )}

      <form onSubmit={onSubmit} className="grid gap-4">
        {paso === 1 ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="tenantName" className="text-white/80">
                Nombre de la empresa
              </Label>
              <Input
                id="tenantName"
                className="auth-field h-11"
                placeholder="Encomiendas XYZ"
                value={tenantName}
                onChange={(e) => onNombreChange(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug" className="text-white/80">
                Identificador
              </Label>
              <Input
                id="slug"
                className="auth-field h-11 font-mono"
                placeholder="encomiendas-xyz"
                pattern="[a-z0-9-]+"
                title="Minúsculas, números y guiones"
                minLength={2}
                maxLength={40}
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
                aria-describedby="slug-hint"
                required
              />
              <p id="slug-hint" className="text-xs text-white/40">
                {slugManual
                  ? "Lo estás definiendo tú. Borra el campo para volver al automático."
                  : "Se genera solo desde el nombre. Puedes editarlo."}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone" className="text-white/80">
                Teléfono o WhatsApp
              </Label>
              <Input
                id="phone"
                type="tel"
                className="auth-field h-11"
                placeholder="+504 9999-8888"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-describedby="phone-hint"
                required
              />
              <p id="phone-hint" className="text-xs text-white/40">
                Para avisarte de tu cuenta y activarte el plan si eliges uno de
                pago.
              </p>
            </div>
          </>
        ) : paso === 2 ? (
          <div
            className="grid gap-2"
            role="radiogroup"
            aria-label="Elige tu plan"
          >
            {(planes ?? []).map((p) => {
              const activo = p.plan === plan;
              return (
                <button
                  key={p.plan}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setPlan(p.plan)}
                  className={`rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5] ${
                    activo
                      ? "border-[#56b3a5] bg-white/10"
                      : "border-white/10 bg-white/5 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-white">{p.name}</span>
                    <span className="text-sm text-white/70">
                      {p.monthlyAmount === 0
                        ? "Gratis"
                        : `${p.currency} ${p.monthlyAmount.toLocaleString("es-HN")}/mes`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/50">
                    {p.shipmentLimit === null
                      ? "Envíos sin límite"
                      : `Hasta ${p.shipmentLimit.toLocaleString("es-HN")} envíos/mes`}
                    {p.features.length > 0 && ` · ${p.features.join(" · ")}`}
                  </p>
                </button>
              );
            })}

            {/* Se dice ANTES de elegir, no después de pagar. Que un plan de pago
                empiece como prueba y no como cobro es exactamente lo que el
                usuario necesita saber para decidir sin miedo. */}
            <p className="mt-2 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              {esDePago
                ? `Empiezas con ${DIAS_DE_PRUEBA_TEXTO} de prueba, sin tarjeta. Te contactamos para activarlo antes de que termine; si no, tu cuenta pasa a Free y no pierdes nada de lo que hayas cargado.`
                : "El plan Free no caduca. Puedes cambiar de plan cuando quieras desde el panel."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-white/80">
                Correo del propietario
              </Label>
              <Input
                id="email"
                type="email"
                className="auth-field h-11"
                placeholder="tu@correo.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-white/80">
                Contraseña
              </Label>
              <PasswordInput
                id="password"
                className="auth-field h-11"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-white/40">Mínimo 8 caracteres.</p>
            </div>
          </>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="auth-cta mt-2 h-11 w-full text-sm font-semibold hover:opacity-100"
        >
          {paso < TOTAL_PASOS
            ? "Continuar"
            : loading
              ? "Creando…"
              : "Crear cuenta"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-white/50">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="rounded font-medium text-[#56b3a5] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]"
        >
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
