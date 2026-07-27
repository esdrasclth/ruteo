# Ruteo — Backend (NestJS + PostgreSQL + Prisma)

Backend de la plataforma SaaS multi-tenant de rastreo de encomiendas.

## Requisitos

- Node.js 20+
- Docker (para Postgres + Redis)

## Desarrollo local (opción A: infra en Docker, backend en host)

Desde la raíz del repo (`ruteo/`):

```bash
cp .env.example .env          # infra (Postgres + Redis)
docker compose up -d          # levanta db (host :5544) y redis (host :6379)
```

En `backend/`:

```bash
cp .env.example .env          # conexión a la DB y secretos JWT
npm install
npx prisma migrate deploy     # aplica migraciones (tablas + RLS)
npm run start:dev             # backend en el host con hot-reload
```

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/docs
- Health: http://localhost:3000/api/health

## Multi-tenancy y RLS

- Estrategia: **shared schema + `tenant_id`** con **Row-Level Security** de Postgres.
- El backend se conecta con un rol no-superusuario (`ruteo_app`) para que las
  políticas RLS se apliquen de verdad; las migraciones corren como el rol owner.
- `PrismaService.withTenant(tenantId, cb)` abre una transacción y fija
  `SET LOCAL app.current_tenant_id` antes de las queries; RLS filtra por tenant.
- El filtro por `tenant_id` en la app es defensa en profundidad, no el único control.

## Endpoints de auth

- `POST /api/auth/register` — crea tenant + usuario owner, devuelve tokens.
- `POST /api/auth/login` — `{ slug, email, password }`, devuelve tokens.
- `POST /api/auth/refresh` — `Authorization: Bearer <refreshToken>`.
- `POST /api/auth/logout` — invalida el refresh token (requiere access token).
- `GET  /api/auth/me` — datos del usuario autenticado.

## Envíos y rastreo (Fase 1)

Requieren access token (roles según acción):

- `POST /api/shipments` — crea un envío (genera `trackingNumber` y evento inicial).
- `GET  /api/shipments` — lista con filtros `status`/`type` y paginación.
- `GET  /api/shipments/:id` — detalle con tramos (legs) y timeline de eventos.
- `PATCH /api/shipments/:id/status` — cambia estado (valida la máquina de estados
  local/internacional), registra el hito y emite evento en tiempo real.
- `POST /api/shipments/:id/legs` — agrega un tramo (solo envíos internacionales).
- `PATCH /api/shipments/:id/legs/:legId` — actualiza estado/ETA/fechas del tramo.

Rastreo público (sin auth):

- `GET /api/tracking/:trackingNumber` — "¿por dónde viene mi paquete?": estado,
  tramo actual, timeline de hitos, coords para mapa y ETA. Resuelve el tenant con
  una función `SECURITY DEFINER` y no expone datos internos ni sensibles.

Tiempo real (Socket.IO, namespace `/tracking`):

- El cliente emite `subscribe` con `{ trackingNumber }` y recibe `shipment.updated`
  en cada cambio de estado/hito.

## Internacional USA → HN (Fase 1.5)

Módulos para la funcionalidad estrella (envío internacional). Requieren access token.

Transportistas (`carriers`):

- `POST/GET/PATCH/DELETE /api/carriers` — catálogo de transportistas internacionales.
  `trackingUrlTemplate` usa el placeholder `{tracking}` para construir la URL de
  rastreo externo del carrier.

Casillero virtual y pre-alerta (`lockers`):

- `POST /api/lockers` — crea un casillero USA para un cliente (código autogenerado).
- `GET /api/lockers` / `GET /api/lockers/:id` — lista y detalle (con paquetes).
- `PATCH /api/lockers/:id` — actualiza datos/estado del casillero.
- `POST /api/lockers/:id/packages` — **pre-alerta**: declara un paquete entrante.
- `GET /api/lockers/:id/packages?status=` — lista paquetes del casillero.
- `PATCH /api/lockers/:id/packages/:packageId/receive` — marca recibido en bodega USA.

Consolidación (`consolidation`):

- `POST /api/consolidation` — agrupa paquetes `RECEIVED` de un casillero en un
  envío internacional (suma peso y valor declarado, genera `trackingNumber`).

Aduana (`customs`):

- `POST /api/customs` — crea/actualiza el registro aduanal de un envío y calcula
  impuestos HN (arancel + ISV 15% + handling); tasas configurables por registro.
- `GET /api/customs/:shipmentId` — consulta el registro aduanal.
- `PATCH /api/customs/:shipmentId/clear` — libera de aduana (estado `CLEARED`).

Rastreo enriquecido: el endpoint público `GET /api/tracking/:trackingNumber` ahora
incluye `mapPath` (ruta geo por tramos para el mapa), coords y URL de tracking
externo por tramo, y un resumen aduanal (estado + cargos totales).

## Importación masiva y etiquetas (Fase 2)

Importación CSV de envíos (`shipments`):

- `POST /api/shipments/import` — `multipart/form-data`, campo `file` con un CSV.
  Columnas por encabezado (orden libre): `type,recipientName,recipientPhone,originLabel,
  originCountry,destinationLabel,destinationCountry,destinationLat,destinationLng,
  weightKg,declaredValue,codAmount,currency`. Cada fila se valida con las mismas reglas
  que `POST /shipments`; las válidas se crean y las inválidas se reportan por línea sin
  abortar el lote. Respuesta: `{ createdCount, failedCount, created[], errors[] }`.

Etiquetas (`shipments`):

- `GET /api/shipments/:id/label` — devuelve una etiqueta SVG (`image/svg+xml`, 100×150)
  con código de barras **Code128** del tracking y un **QR** que apunta a la URL pública
  de rastreo (`PUBLIC_APP_URL` + `/api/tracking/:trackingNumber`), más destinatario,
  destino, peso y COD.

## Operación logística (Fase 2)

Módulos para la operación de reparto local. Requieren access token.

Zonas (`zones`):

- `POST/GET/PATCH/DELETE /api/zones` — zonas de reparto con centro geo y radio.
  `code` es único por tenant.

Tarifas (`rates`):

- `POST/GET/PATCH/DELETE /api/rates` — tarifas (base + por kg + por km + cargo mínimo),
  opcionalmente ligadas a una zona.
- `POST /api/rates/quote` — cotiza `max(minCharge, baseFee + perKg·kg + perKm·km)`
  resolviendo por `rateId` o por la tarifa activa de una zona. Abierto a merchants.

Repartidores (`drivers`):

- `POST/GET/PATCH/DELETE /api/drivers` — flota; `GET` filtra por `status`.
  `userId` opcional vincula un usuario (login del repartidor).

Rutas y paradas (`routes`):

- `POST /api/routes` — crea una ruta para un repartidor (código autogenerado).
- `GET /api/routes?driverId=&status=` / `GET /api/routes/:id` — lista y detalle.
- `PATCH /api/routes/:id/status` — cambia estado (marca `startedAt`/`completedAt`).
- `POST /api/routes/:id/stops` — agrega una parada (secuencia automática; coords por
  defecto tomadas del destino del envío).
- `POST /api/routes/:id/optimize` — reordena por vecino más cercano (Haversine) desde
  un punto de inicio (dado, o centro de la zona del repartidor, o primera parada).
- `PATCH /api/routes/:id/stops/:stopId/arrive` — marca llegada.
- `POST /api/routes/:id/stops/:stopId/complete` — **POD**: firma/foto/receptor/geo,
  cierra la parada y avanza el envío a `PICKED_UP`/`DELIVERED` según el tipo.
- `POST /api/routes/:id/stops/:stopId/fail` — intento fallido con motivo; avanza el
  envío a `FAILED_ATTEMPT`.

La prueba de entrega (`ProofOfDelivery`) se guarda por parada y la transición de estado
del envío reutiliza la máquina de estados (`canTransition`), el timeline de eventos y
los emits por WebSocket.

## Pagos, API keys y webhooks (Fase 3)

Pagos contra entrega (`payments`):

- Al crear un envío con `codAmount > 0` se abre automáticamente un pago **COD**
  en estado `PENDING`, dentro de la misma transacción del envío.
- Al pasar el envío a `DELIVERED` (incluida la entrega vía POD de rutas) sus pagos
  COD pendientes se marcan `COLLECTED` en la misma transacción.
- `GET /api/payments?status=&type=&driverId=` — lista de pagos con filtros.
- `GET /api/payments/summary` — totales COD agrupados por estado (reconciliación).
- `GET /api/payments/:id` — detalle.
- `PATCH /api/payments/:id/collect` — cobro manual (método/referencia/repartidor);
  abierto también a `DRIVER`.
- `PATCH /api/payments/:id/remit` — liquida un pago `COLLECTED` → `REMITTED`.

API keys para integraciones (`api-keys`, roles OWNER/ADMIN):

- `POST /api/api-keys` — genera una clave `rk_<prefix>_<secret>`. **El texto plano se
  devuelve una sola vez**; en la base sólo se guarda el `prefix` y un `sha256` de la clave.
- `GET /api/api-keys` — lista (prefijo, último uso, revocación).
- `DELETE /api/api-keys/:id` — revoca la clave.
- Uso: header `x-api-key: rk_...` en los endpoints de `shipments`. La clave se resuelve
  a su tenant con la función `SECURITY DEFINER` `api_key_by_prefix` y actúa con rol
  `MERCHANT` (crear/consultar envíos). Clave inválida o revocada → `401`.

Webhooks firmados (`webhooks`, roles OWNER/ADMIN):

- `POST/GET/PATCH/DELETE /api/webhooks` — CRUD de endpoints (`url`, `events[]`, `active`).
  Al crear se genera un `secret` (`whsec_...`) devuelto una sola vez.
- En cada cambio de estado de un envío se despacha el evento `shipment.status_changed`
  a los endpoints activos suscritos (fire-and-forget, con reintentos). Cada intento se
  registra en `webhook_deliveries` (estado, intentos, código HTTP, último error).
- Firma: header `x-ruteo-signature: sha256=<hmac>` calculado con HMAC-SHA256 del cuerpo
  usando el `secret` del endpoint; header `x-ruteo-event` con el nombre del evento.

## Suscripciones y notificaciones (Fase 4)

Billing / planes SaaS (`billing`):

- Catálogo de planes en código (`plans.ts`): FREE/STARTER/PRO/ENTERPRISE con precio
  mensual (HNL) y límites. `GET /api/billing/plans`.
- `GET /api/billing/subscription` — suscripción actual del tenant (404 si no hay).
- `POST /api/billing/subscribe` — `{ plan }`: activa/actualiza la suscripción, fija
  `Tenant.plan` y abre un pago `SUBSCRIPTION` PENDING si el plan tiene costo (roles OWNER/ADMIN).
- `POST /api/billing/cancel` — `{ atPeriodEnd? }`: cancela ya (plan → FREE) o al final del período.
- **Seam de proveedor** (`BillingProvider`): el default `ManualBillingProvider` activa la
  suscripción de inmediato (período de 30 días, sin cobro externo). Un proveedor **Stripe**
  se conecta implementando la misma interfaz sin tocar el servicio — diferido porque
  requiere cuenta/credenciales.
- **Cuotas de plan (Fase 6):** cada plan define `shipmentLimit` (FREE 50, STARTER 500,
  PRO 5000, ENTERPRISE ilimitado). `GET /api/billing/usage` reporta plan, ventana del período,
  límite, envíos usados y restantes. El período sale de la suscripción activa
  (`currentPeriodStart/End`); sin suscripción se usa el mes calendario (UTC). Crear un envío
  por encima del límite (incluida la importación CSV) devuelve `403` con mensaje en español;
  en el import las filas que exceden la cuota se reportan en `errors[]` sin abortar las válidas.

Notificaciones (`notifications`):

- **Seam de proveedor** (`NotificationProvider`): el default `LogNotificationProvider`
  "entrega" registrando en log, de modo que el pipeline corre completo sin cuentas externas.
  Firebase (push), Twilio (SMS/WhatsApp) o SES (email) se conectan por la misma interfaz.
- En cada cambio de estado de un envío con `recipientPhone` se despacha una notificación
  SMS al destinatario (fire-and-forget) con un mensaje en español según el hito.
- `GET /api/notifications?status=&channel=` — historial (persistido con estado SENT/FAILED).
- `POST /api/notifications` — envío manual `{ channel, recipient, type, title?, body, shipmentId? }`
  (roles OWNER/ADMIN/OPERATOR).

## Analítica y reportes (Fase 5)

Agregaciones de solo lectura sobre los datos del tenant (envíos, pagos/COD, ingresos,
desempeño de repartidores). Requieren access token (roles OWNER/ADMIN/OPERATOR). Todos
los endpoints aceptan un rango opcional `?from=&to=` (ISO 8601); por defecto los últimos
30 días. Las consultas corren dentro de `withTenant` (RLS filtra por tenant).

- `GET /api/analytics/overview` — resumen: envíos por estado (total, entregados, fallidos,
  devueltos, cancelados y `deliveryRate`), COD por estado (pendiente/cobrado/liquidado),
  ingresos por suscripción por estado y notificaciones enviadas/fallidas.
- `GET /api/analytics/shipments` — envíos agrupados por estado, por tipo y serie diaria
  (`date_trunc('day')`).
- `GET /api/analytics/payments` — desglose de pagos por `type` × `status` con conteo y monto.
- `GET /api/analytics/drivers` — COD cobrado por repartidor (`collectedByDriverId`,
  estados COLLECTED/REMITTED en el rango de `collectedAt`), con nombre resuelto.

## Idempotencia de la API (Fase 8)

`POST /api/shipments` acepta un header opcional `Idempotency-Key`. La primera petición se
ejecuta y su respuesta se guarda; los reintentos con la **misma** key **replican** la respuesta
almacenada (mismo `status` y cuerpo) en lugar de crear un envío duplicado — clave para
integraciones que reintentan por timeouts de red. Las keys son **por tenant** (tabla
`idempotency_keys` con RLS/FORCE, único `[tenant_id, key]`).

- Petición en curso con la misma key → `409` (`Ya hay una petición en curso…`).
- Misma key para otra operación/endpoint → `409`.
- Si la petición falla (ej. validación `400`), la reserva se libera y un reintento válido
  con la misma key vuelve a ejecutarse normalmente.

## Bitácora de auditoría (Fase 7)

Registro inmutable de acciones sensibles por tenant (quién hizo qué). Tabla `audit_logs`
con `tenant_id` + RLS/FORCE; cada entrada guarda `action`, `entityType`/`entityId`, el actor
(`actorUserId`/`actorRole`) y `metadata` (JSON). El registro es fire-and-forget (`dispatch`),
de modo que un fallo de auditoría nunca rompe la operación original.

Acciones registradas: `shipment.status_changed` (con `from`/`to`), `payment.collected`,
`payment.remitted`, `api_key.created`, `api_key.revoked`, `subscription.changed`,
`subscription.canceled`.

- `GET /api/audit` — lista paginada (roles OWNER/ADMIN), filtros `?action=&entityType=&entityId=`
  y `?page=&pageSize=`. Ordenada por fecha descendente.

## Rate limiting (Fase 9)

La API de envíos (`/api/shipments`) está protegida por un limitador de tasa **fixed-window**
respaldado por Redis (`RateLimitGuard`). El límite por defecto es **120 solicitudes por
60 s**, medido **por tenant + identidad del llamante** (prefijo de API key `key:<prefix>` o
`user:<userId>`), de modo que un tenant o una API key no consumen la cuota de otro.

- Al exceder el límite → `429 Too Many Requests` (`Límite de solicitudes excedido…`).
- Headers en cada respuesta: `X-RateLimit-Limit`, `X-RateLimit-Remaining` y, al bloquear,
  `Retry-After` (segundos hasta el siguiente ventaneo).
- La clave en Redis es `rl:<tenantId>:<identidad>:<windowStart>` con `EXPIRE NX`.
- **Fail-open**: si Redis no está disponible, el guard deja pasar la petición (nunca bloquea
  la API por una caída de Redis). Configurable vía `REDIS_HOST`/`REDIS_PORT`.
- Ajuste por ruta con el decorador `@RateLimit(limit, windowSeconds)`.

## Health checks (Fase 10)

Dos sondas separadas, pensadas para orquestadores (k8s / balanceadores):

- `GET /api/health` — **liveness**: sólo confirma que el proceso responde. Siempre `200` si la
  app está viva; no chequea dependencias (una caída de Redis no debe reiniciar el pod).
- `GET /api/health/ready` — **readiness**: verifica Postgres (`SELECT 1`) y Redis (`PING`) en
  paralelo. Responde `200` con `{ ready: true, checks: { db, redis } }` cuando todo está `up`;
  si alguna dependencia falla devuelve `503` con `status: "degraded"` y el detalle por check.

## Pruebas de aislamiento multi-tenant

```bash
npm run test:e2e              # requiere `docker compose up -d` (Postgres + Redis)
```

Dos suites cubren la garantía central del SaaS — *un tenant no puede ver ni tocar los
datos de otro* — desde los dos lados de la línea de defensa:

- **`test/rls-isolation.e2e-spec.ts`** — las políticas RLS de Postgres. Corre con el rol
  de aplicación (`ruteo_app`) y lo primero que verifica es que ese rol **no** sea
  superusuario ni tenga `BYPASSRLS`; sin eso las demás pruebas no probarían nada.
  Comprueba, para 17 tablas tenant-scoped, que una lectura por id desde otro tenant
  devuelve `null` (con un control que confirma que la fila sí existe en su propio
  tenant), y que `update`/`delete`/`updateMany`/`deleteMany` no alcanzan filas ajenas.
  Añade los casos que suelen romperse en silencio: búsqueda por `tracking_number`
  (único **global**, no por tenant), relaciones anidadas, agregados, `INSERT` marcado
  con el `tenant_id` de otro, reasignar una fila propia a otro tenant, ausencia de
  contexto (**fail-closed**: sin `app.current_tenant_id` no se ve ninguna fila) y que
  el contexto no sobrevive a la transacción.
- **`test/api-tenant-isolation.e2e-spec.ts`** — la misma garantía por HTTP, levantando
  el `AppModule` real con el cableado de `main.ts`. Registra dos tenants, y verifica que
  con token o con **API key** de uno los recursos del otro respondan `404` (nunca `403`,
  que confirmaría su existencia), que el listado y el `total` paginado no crucen datos,
  que las credenciales de un tenant no sirvan en el slug de otro y que el rastreo público
  no exponga ids internos, COD, valor declarado ni teléfono.

Una prueba estructural recorre `pg_class`/`pg_policies` y falla si **cualquier** tabla con
columna `tenant_id` queda sin `ENABLE`/`FORCE ROW LEVEL SECURITY` o sin política — la red
de seguridad para cuando una migración nueva agregue una tabla y olvide su `*_rls`.

Los tests usan la base de desarrollo. Todo lo que crean cuelga de tenants con slug
`test-iso-*` y se purga al empezar y al terminar (el borrado en cascada arrastra las filas
hijas); nunca truncan tablas ni tocan datos ajenos a ese prefijo.

## Build / producción

```bash
npm run build                 # compila a dist/
docker build -t ruteo-backend .   # imagen multi-stage para CI/prod
```
