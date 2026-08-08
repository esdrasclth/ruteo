# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Qué es este proyecto

El sitio público de Ruteo (la landing). Es un Next.js **independiente** del panel,
que vive en `../frontend`. Aquí no hay sesión, ni llamadas a la API, ni estado de
usuario: es una página de venta estática.

Las rutas de aplicación —`/track`, `/login`, `/register`— **no viven aquí**. Se
enlazan al dominio del panel a través de `NEXT_PUBLIC_APP_URL` (ver
`src/lib/app-url.ts`). Nunca las enlaces con una ruta relativa: en producción la
landing y el panel están en dominios distintos.

# El logo

`public/logo.svg` es una **copia recortada** del maestro, que vive en
`../branding/logo.svg` y no se toca. El maestro declara `viewBox="0 0 2000 1000"`
pero el dibujo no lo llena: sobra más de la mitad del alto, así que puesto tal cual
se ve pequeño y descentrado. La copia lleva el `viewBox` ajustado a la caja real
medida. Relación de aspecto del arte: **3.79:1**, de ahí el `width={120} height={32}`.

**Vuelve a MEDIR cada vez que el maestro cambie; no reutilices el recorte anterior.**
No es teórico: entre dos exportaciones seguidas del mismo logo la caja pasó de
`y 235→764` a `y 264→736`, y aplicar el recorte viejo lo habría descuadrado. El
`viewBox` que trae el archivo tampoco sirve de referencia — a veces viene con aire
(`logo.svg`) y a veces ya ajustado (`logo-negativo.svg`, que se copia tal cual al
panel en `../frontend/public/`).

Para medirlo hay que recorrer el árbol de `<g transform>` acumulando matrices; los
trazos van anidados en varias capas y leer solo el primer `transform` da un
resultado equivocado.

El sistema de diseño (tokens de `globals.css` y `components/ui`) está duplicado a
propósito con el del panel. Si cambias un token de marca aquí, cámbialo también
en `../frontend/src/app/globals.css` o los dos sitios dejarán de parecerse.
