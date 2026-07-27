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
