# syntax=docker/dockerfile:1

# Sitio público (Next.js, salida `standalone`). No habla con el backend: solo
# enlaza al panel, así que sus variables son URLs de destino.

# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Mismo motivo que en el panel: `NEXT_PUBLIC_*` se incrusta en el bundle durante
# el build. `NEXT_PUBLIC_SITE_URL` además alimenta el JSON-LD, que necesita URLs
# absolutas; con el valor por defecto la landing se anunciaría a los buscadores
# como `http://localhost:3003`.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime stage ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3003
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
