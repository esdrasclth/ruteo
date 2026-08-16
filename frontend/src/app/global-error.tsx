"use client";

/**
 * El último recurso: falló el propio armazón raíz.
 *
 * Sustituye a `layout.tsx` entero cuando actúa, así que **tiene que traer sus
 * propias `<html>` y `<body>`** y no puede apoyarse en nada de la aplicación:
 * ni tokens de color garantizados, ni proveedores, ni componentes que importen
 * contexto. Por eso va con estilos en línea y sin dependencias — un fallback
 * que a su vez depende de lo que se rompió no se llega a ver nunca.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#f6f8f8",
          color: "#04151f",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Ruteo no pudo arrancar
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#5b6b71",
            }}
          >
            Falló algo de lo que sostiene toda la aplicación, no una pantalla
            suelta. Reintenta; si vuelve a pasar, avísanos con la referencia.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "0.5rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.6875rem",
                color: "#8a979c",
              }}
            >
              ref. {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#fff",
              background: "#04151f",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
