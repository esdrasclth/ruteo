# Ruteo

Plataforma SaaS multiempresa para operaciones de mensajería y courier: prealerta,
recepción en bodega, consolidación, aduana, rutas de reparto, prueba de entrega y
cobro — con cada empresa aislada en la misma base de datos.

[![CI](https://github.com/esdrasclth/ruteo/actions/workflows/ci.yml/badge.svg)](https://github.com/esdrasclth/ruteo/actions/workflows/ci.yml)

> Repositorio privado. No contiene secretos —`backend/.env` está en `.gitignore`—
> pero sí el esquema completo, las políticas de aislamiento y los archivos de
> despliegue.

---

## Qué resuelve

Un courier pequeño lleva la operación en hojas de cálculo y grupos de WhatsApp: el
paquete existe cuando alguien lo escribe, la evidencia de una entrega es una foto
en el teléfono del repartidor y la pregunta de fin de mes —cuánto de lo que entró
es ingreso propio y cuánto es tributo que sólo se traslada— no tiene respuesta.

Ruteo cubre el recorrido completo del bulto y lo deja **auditable**: quién lo tocó,
cuándo, dónde, con qué evidencia y con qué cargos.

| Área | Qué hace |
| --- | --- |
| **Casillero y prealerta** | El cliente anuncia su compra; el bulto nace antes de llegar |
| **Recepción** | Peso físico, volumétrico y cobrable, dimensiones, estado y fotos |
| **Consolidación** | Varios bultos de un cliente en un envío, sin perder la trazabilidad |
| **Manifiestos y viajes** | Guía madre e hijas, con cotejo de lo recibido contra lo declarado |
| **Aduana** | Reglas versionadas por fecha, expediente documental y liquidación |
| **Cargos y pagos** | Ingreso propio separado del tributo trasladado; COD y mostrador |
| **Rutas** | Optimización por cercanía, ruteo real por carretera (OSRM) |
| **Entrega** | Un intento por visita, con motivo tipificado, firma y foto |
| **Excepciones** | Faltantes, daños y retenciones como entidad, no como nota suelta |

---

## Arquitectura

Tres aplicaciones sobre una infraestructura común:

```
                       ┌──────────────┐
   panel (Next.js) ────▶              │
                       │   backend    │──▶ PostgreSQL (RLS por empresa)
   landing (Next.js)   │   (NestJS)   │──▶ Redis + BullMQ (colas)
                       │              │──▶ S3 / MinIO (evidencia)
   app del repartidor ─▶              │──▶ OSRM + Nominatim (rutas)
        (pendiente)    └──────┬───────┘
                              └────────▶ ZITADEL (credenciales)
```

| Componente | Tecnología | Puerto (local) |
| --- | --- | --- |
| `backend/` | NestJS 11, Prisma 6, Swagger | **3002** (`/api`, docs en `/docs`) |
| `frontend/` | Next.js 16, React, Tailwind | **3001** |
| `landing/` | Next.js 16 | **3003** |
| PostgreSQL | 16, con `unaccent` | **5544** |
| Redis | colas BullMQ y rate limiting | 6379 |
| OSRM | ruteo por carretera (Honduras) | 5100 |

### Aislamiento entre empresas

Es la decisión que gobierna el resto del diseño. Cada empresa es un `Tenant` y
**todas las tablas del negocio llevan Row Level Security** de PostgreSQL: el
aislamiento lo impone la base, no el código de la aplicación, así que una consulta
mal escrita no puede filtrar datos de otra empresa.

Dos consecuencias que conviene conocer antes de tocar el esquema:

- **Prisma no genera las políticas RLS.** Cada tabla nueva las lleva escritas a
  mano en su migración. Olvidarlas no rompe nada visiblemente —la tabla funciona—
  pero deja los datos de todas las empresas al alcance de cualquiera con sesión.
- **El almacenamiento de objetos no tiene RLS.** Por eso la clave de cada archivo
  empieza por el identificador de la empresa (`t/{tenantId}/...`) y las URLs se
  firman al leer, con vigencia corta; nunca se guarda una URL firmada.

### Autenticación

Las credenciales viven en **ZITADEL**; Ruteo emite sus propios tokens de sesión.
Los códigos de un solo uso (restablecer contraseña, verificar correo) los custodia
Ruteo a propósito — el motivo está documentado en
[`docs/decision-auth-zitadel.md`](docs/decision-auth-zitadel.md).

Cada empresa entra por su propio subdominio; ver
[`docs/acceso-por-subdominio.md`](docs/acceso-por-subdominio.md).

---

## Puesta en marcha

Requisitos: **Node 20**, Docker y Docker Compose.

```bash
# 1. Infraestructura (Postgres, Redis, OSRM)
docker compose up -d

# 2. Backend
cd backend
npm install
cp .env.example .env          # revisa los valores antes de seguir
npx prisma migrate deploy
npx prisma generate
npm run start:dev             # http://localhost:3002/api  ·  docs en /docs

# 3. Panel
cd ../frontend && npm install && npm run dev    # http://localhost:3001

# 4. Sitio público
cd ../landing && npm install && npm run dev     # http://localhost:3003
```

Comprobación de que está sano:

```bash
curl http://localhost:3002/api/health/ready
# {"ready":true,"checks":{"db":"up","redis":"up","almacenamiento":"up"}}
```

`/api/health` sólo dice que el proceso vive; `/api/health/ready` es el que
comprueba las dependencias.

### Datos de prueba

**No hay script de seed.** Se registra una empresa desde `/register` y se cargan
los datos siguiendo [`docs/datos-de-prueba.md`](docs/datos-de-prueba.md), que es a
la vez el guion de pruebas del panel.

El motor de rutas OSRM necesita sus artefactos generados una sola vez
(`scripts/osrm-prepare.sh`). Si está caído, el backend arranca igual y cae a
distancias en línea recta.

---

## Pruebas

```bash
cd backend
npm test          # unitarias
npm run test:e2e  # extremo a extremo, incluye aislamiento entre empresas
```

Las suites e2e corren **en paralelo**, así que cada una purga sólo su propio grupo
de empresas de prueba: una purga global haría que una suite borre los datos que
otra está usando.

---

## Estructura

```
backend/          API NestJS, Prisma, colas y almacenamiento
  prisma/         esquema y migraciones (con sus políticas RLS)
  src/modules/    un módulo por área del negocio
frontend/         panel de operación
landing/          sitio público
deploy/           configuración de Traefik y utilidades del VPS
scripts/          respaldos, preparación de OSRM, tareas programadas
docs/             decisiones de diseño y guías de despliegue
.github/          integración continua
```

---

## Despliegue

Dos caminos, ambos documentados:

- **[Dokploy](docs/despliegue-dokploy.md)** (recomendado) — Traefik delante,
  certificado comodín para los paneles por empresa y auto-deploy desde la rama
  configurada. Usa `docker-compose.dokploy.yml`.
- **[VPS manual](docs/despliegue-vps.md)** — `docker-compose.prod.yml`.

En ambos, el servicio de migraciones ejecuta `prisma migrate deploy` en cada
despliegue. Antes de desplegar un cambio de esquema conviene tener respaldo
reciente: `scripts/respaldo-db.sh`.

---

## Documentación

| Documento | De qué trata |
| --- | --- |
| [`plan-courier.md`](docs/plan-courier.md) | El plan por fases y su estado. Empieza por aquí |
| [`funcionalidades-ruteo.md`](docs/funcionalidades-ruteo.md) | Catálogo funcional |
| [`api-para-empresas.md`](docs/api-para-empresas.md) | Llaves de API y sus permisos: integrar la web de una empresa |
| [`almacenamiento-archivos.md`](docs/almacenamiento-archivos.md) | Cómo se guardan y se firman los archivos |
| [`decision-auth-zitadel.md`](docs/decision-auth-zitadel.md) | Por qué las credenciales están fuera |
| [`acceso-por-subdominio.md`](docs/acceso-por-subdominio.md) | Un panel por empresa |
| [`datos-de-prueba.md`](docs/datos-de-prueba.md) | Guion de pruebas del panel |
| [`despliegue-dokploy.md`](docs/despliegue-dokploy.md) · [`despliegue-vps.md`](docs/despliegue-vps.md) | Puesta en producción |

Las decisiones de diseño no viven sólo aquí: el esquema de Prisma y los servicios
llevan comentarios que explican **por qué** algo es como es, sobre todo donde la
opción evidente era la equivocada.
