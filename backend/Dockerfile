# syntax=docker/dockerfile:1

# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# --- Dependencies stage (production only) ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
# El cliente generado se copia de la etapa de build en vez de volver a
# generarlo aquí. `prisma` es una dependencia de desarrollo, así que en una
# instalación sin ellas el `generate` tendría que descargar el CLI de la red en
# cada build: más lento, y una build que depende de que npm esté disponible
# justo en ese momento. El artefacto ya está hecho unas líneas más arriba.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# --- Migraciones (one-shot) ---
#
# Etapa propia porque las migraciones NO se aplican al arrancar cada contenedor:
# son un paso explícito y observable del despliegue —`docker compose ps` te dice
# si terminaron bien—, y así el CLI de Prisma y el historial de migraciones no
# viajan dentro de la imagen que queda corriendo meses.
#
# Es también el orden que ya documenta `docs/despliegue-vps.md`: migrar y
# DESPUÉS rotar las contraseñas de Postgres.
FROM node:20-alpine AS migraciones
WORKDIR /app
# `npm ci` completo, CON las de desarrollo: el CLI de `prisma` es una de ellas y
# el lockfile lo fija a la misma versión que `@prisma/client`. Instalarlo aparte
# obligaría a repetir la versión a mano en el Dockerfile, que es exactamente el
# sitio donde se queda desactualizada.
#
# Que la imagen sea grande da igual: es un contenedor que corre una vez y muere.
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
# npx escribe en la caché de npm; sin un HOME donde pueda, falla como root-only.
ENV npm_config_cache=/tmp/.npm
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# --- Runtime stage ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

# Sin esto el proceso corre como root: cualquier fallo que permita ejecutar algo
# dentro del contenedor lo hace con todos los permisos. `node` es un usuario sin
# privilegios que la imagen oficial ya trae, así que no hay que crearlo.
#
# No se copia `prisma/` a propósito: el runtime no migra, y el esquema no tiene
# nada que hacer en la imagen que queda expuesta.
USER node

EXPOSE 3000

# Comprueba `ready` y no `health`: el primero confirma que Postgres y Redis
# responden, que es lo que de verdad determina si este contenedor puede atender.
# Docker no reinicia por estar unhealthy —eso es cosa de un orquestador—, así que
# el valor aquí es de diagnóstico: `docker compose ps` distingue "arrancado" de
# "sirviendo", que es justo la duda a las 3 de la mañana.
#
# Se usa el `fetch` de Node en vez de curl o wget porque la imagen no trae curl y
# añadirlo por un healthcheck es meter superficie en la imagen final.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `dist/src/main`, no `dist/main`: el build compila también `scripts/`, así que
# tsc toma la raíz común de los dos y conserva la estructura bajo `dist/`.
# Comprobado levantando la imagen; con `dist/main` el contenedor entra en bucle
# de reinicio con MODULE_NOT_FOUND.
#
# Por eso mismo `dist/scripts/` viaja en la imagen, que es como se crea el primer
# superadmin en el VPS:
#   docker compose -f docker-compose.prod.yml run --rm backend \
#     node dist/scripts/crear-superadmin.js
CMD ["node", "dist/src/main"]
