# syntax=docker/dockerfile:1

# Panel de tenant y de plataforma (Next.js, salida `standalone`).

# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# **Las variables NEXT_PUBLIC_* se incrustan en el bundle durante `next build`,
# no se leen al arrancar.** Por eso entran como `build-arg` y no como variable
# de entorno del contenedor: ponerlas en el `environment` del compose no tiene
# ningún efecto, la aplicación seguiría apuntando a donde estuviera cuando se
# construyó la imagen. Cambiar la URL de la API obliga a reconstruir.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Dominio bajo el que cuelgan los paneles de empresa
# (`enviospress.ruteo.brandsofts.com`). De aquí sale el slug del tenant, que ya
# no se teclea en el login. Si no coincide con el host real, `slugDelHost`
# devuelve null y el panel dice "entra por la dirección de tu empresa" a todo el
# mundo, incluso entrando por la dirección correcta.
ARG NEXT_PUBLIC_PANEL_BASE_HOST
ENV NEXT_PUBLIC_PANEL_BASE_HOST=$NEXT_PUBLIC_PANEL_BASE_HOST

COPY package*.json ./
# `scripts/` va ANTES de `npm ci`: el `postinstall` del proyecto ejecuta
# `copy-maplibre-worker.mjs`, y sin el archivo la instalación falla entera.
COPY scripts ./scripts
RUN npm ci

COPY . .
# Se vuelve a ejecutar DESPUÉS de copiar el código: el `COPY` de arriba trae el
# /public del host, que puede llevar workers de otra versión de MapLibre y
# pisar los que acaba de poner el postinstall. Es idempotente.
RUN node scripts/copy-maplibre-worker.mjs
RUN npm run build

# --- Runtime stage ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
# `server.js` escucha en localhost por defecto, y desde fuera del contenedor eso
# no se alcanza. La exposición al exterior la decide el compose (que publica
# solo en 127.0.0.1) y el proxy, no esto.
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
WORKDIR /app

# `standalone` no incluye `public` ni `.next/static`: hay que copiarlos a mano o
# la aplicación arranca sin estáticos y sin imágenes.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
