import { config } from 'dotenv';
import { join } from 'path';

// Los e2e corren contra la infra real de desarrollo (docker compose: Postgres +
// Redis). Cargamos `backend/.env` igual que hace ConfigModule en runtime, para
// que tanto Nest como los clientes Prisma crudos de los tests vean las mismas
// credenciales.
config({ path: join(__dirname, '..', '.env') });

// Namespace propio de BullMQ por proceso de test.
//
// Tiene que fijarse AQUÍ y no en un `beforeAll`: `ConfigModule.forRoot()` se
// evalúa al importar `app.module.ts`, o sea antes de que corra cualquier hook.
// Fijarlo más tarde no tiene ningún efecto, y las suites acaban compartiendo la
// cola `bull` con el backend de desarrollo: sus workers se roban los jobs y las
// pruebas de entrega fallan de forma intermitente.
process.env.QUEUE_PREFIX = `bull-test-${process.pid}-${Date.now()}`;

// El e2e de colas levanta su receptor de webhooks en `http://127.0.0.1:<puerto>`,
// que es exactamente lo que `destino-seguro.ts` bloquea: sin esto, el alta del
// endpoint responde 400 y se cae la suite entera.
//
// Es el caso para el que existe la bandera —probar contra un servidor local—, y
// va aquí por el mismo motivo que `QUEUE_PREFIX`: fijarla en un `beforeAll`
// llegaría tarde, porque `ConfigModule` ya se evaluó al importar el módulo.
//
// Con la bandera activa la entrega va por `fetch` y no por el camino de IP
// fijada; ese lo cubren las pruebas unitarias de `destino-seguro`.
process.env.WEBHOOKS_PERMITIR_DESTINOS_PRIVADOS = 'true';
