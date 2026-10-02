/**
 * Alta de un superadmin de la plataforma, o cambio de su contraseña si ya
 * existe. Es también la única forma de recuperar el acceso de un superadmin: el
 * panel de plataforma no tiene «¿Olvidaste tu contraseña?» a propósito.
 *
 * Va por script y no por endpoint a propósito: un endpoint que crea cuentas con
 * acceso a todas las empresas es un objetivo permanente, aunque esté protegido.
 * Esto exige acceso al servidor, que es un requisito bastante más difícil de
 * cumplir para un atacante que encontrar una ruta olvidada.
 *
 *   npx ts-node scripts/crear-superadmin.ts correo@dominio contraseña "Nombre"
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import {
  hashearContrasena,
  incumplePolitica,
} from '../src/modules/auth/contrasenas';

dotenv.config({ path: ['.env.local', '.env'] });

const [email, password, nombre] = process.argv.slice(2);

async function main() {
  if (!email || !password) {
    throw new Error(
      'Uso: npx ts-node scripts/crear-superadmin.ts <correo> <contraseña> [nombre]',
    );
  }
  // La MISMA política que aplica el backend a cualquier contraseña nueva.
  const motivo = incumplePolitica(password);
  if (motivo) throw new Error(motivo);
  if (password.length < 12) {
    // Aviso y no bloqueo: la cuenta es del dueño del sistema y él decide. Pero
    // esta credencial abre TODAS las empresas de golpe, así que 12+ caracteres
    // no es celo, es lo que corresponde a lo que protege.
    console.warn(
      `AVISO: la contraseña tiene ${password.length} caracteres. Esta cuenta da acceso
` +
        '       a los datos de todas las empresas; conviene una de 12 o más.',
    );
  }

  const passwordHash = await hashearContrasena(password);

  // Rol `ruteo` (dueño): `ruteo_app` no tiene permiso sobre esta tabla.
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const existente = await db.platformAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });
  const admin = await db.platformAdmin.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), name: nombre ?? null, passwordHash },
    update: { passwordHash, ...(nombre ? { name: nombre } : {}) },
  });
  await db.$disconnect();

  console.log(
    existente
      ? `Contraseña cambiada: ${admin.email}`
      : `Superadmin creado: ${admin.email}`,
  );
  console.log(`  entra en: ${process.env.PANEL_URL ?? 'http://localhost:3001'}/admin/login`);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
