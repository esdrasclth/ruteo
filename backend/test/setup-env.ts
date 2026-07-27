import { config } from 'dotenv';
import { join } from 'path';

// Los e2e corren contra la infra real de desarrollo (docker compose: Postgres +
// Redis). Cargamos `backend/.env` igual que hace ConfigModule en runtime, para
// que tanto Nest como los clientes Prisma crudos de los tests vean las mismas
// credenciales.
config({ path: join(__dirname, '..', '.env') });
