/**
 * Fija la contraseña de un usuario de una empresa desde el servidor.
 *
 * Es la salida de emergencia para quien no puede recuperarla solo: el
 * restablecimiento por código exige el correo verificado, y si el afectado es
 * el único OWNER no hay nadie en el panel que se la pueda restablecer. Pasó con
 * todas las cuentas al sacar las contraseñas de ZITADEL
 * (`docs/decision-auth-local.md`).
 *
 * Va por script y no por endpoint por lo mismo que `crear-superadmin.ts`: exige
 * acceso al servidor. Corta además la sesión abierta, como el restablecimiento
 * del panel.
 *
 *   npx ts-node scripts/restablecer-contrasena.ts <slug> <correo> <contraseña>
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import {
  hashearContrasena,
  incumplePolitica,
} from '../src/modules/auth/contrasenas';

dotenv.config({ path: ['.env.local', '.env'] });

const [slug, email, password] = process.argv.slice(2);

async function main() {
  if (!slug || !email || !password) {
    throw new Error(
      'Uso: npx ts-node scripts/restablecer-contrasena.ts <slug> <correo> <contraseña>',
    );
  }
  const motivo = incumplePolitica(password);
  if (motivo) throw new Error(motivo);

  const passwordHash = await hashearContrasena(password);
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  try {
    const [fila] = await db.$queryRaw<{ tenant_id_by_slug: string | null }[]>`
      SELECT tenant_id_by_slug(${slug})`;
    const tenantId = fila?.tenant_id_by_slug;
    if (!tenantId) throw new Error(`No existe la empresa «${slug}»`);

    // `users` tiene FORCE ROW LEVEL SECURITY: sin el contexto del tenant, el
    // UPDATE no ve ninguna fila y "funciona" sin cambiar nada.
    const cambiadas = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      const r = await tx.user.updateMany({
        where: { tenantId, email: email.toLowerCase() },
        data: { passwordHash, refreshTokenHash: null },
      });
      return r.count;
    });
    if (cambiadas === 0) {
      throw new Error(`No existe ${email} en la empresa «${slug}»`);
    }
    console.log(`Contraseña cambiada: ${email.toLowerCase()} (${slug})`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
