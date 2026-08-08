/**
 * Alta del primer superadmin de la plataforma.
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

dotenv.config({ path: ['.env.local', '.env'] });

const [email, password, nombre] = process.argv.slice(2);

async function main() {
  if (!email || !password) {
    throw new Error(
      'Uso: npx ts-node scripts/crear-superadmin.ts <correo> <contraseña> [nombre]',
    );
  }
  // Se valida contra la MISMA política que aplica ZITADEL (8 caracteres, con
  // mayúscula, minúscula, número y símbolo). Comprobarlo aquí da un error claro
  // en vez de un 500 del proveedor a mitad del alta.
  const cumple =
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  if (!cumple) {
    throw new Error(
      'La contraseña debe tener 8+ caracteres con mayúscula, minúscula, número y símbolo.',
    );
  }
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

  const issuer = (process.env.ZITADEL_ISSUER ?? '').replace(/\/+$/, '');
  const token = process.env.ZITADEL_SERVICE_TOKEN ?? '';
  if (!issuer || !token) throw new Error('Faltan ZITADEL_ISSUER / ZITADEL_SERVICE_TOKEN');

  const loginName = `plataforma:${email.toLowerCase()}`;
  const res = await fetch(`${issuer}/v2/users/human`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: loginName,
      profile: { givenName: nombre ?? email, familyName: nombre ?? email },
      email: { email, isVerified: true },
      password: { password, changeRequired: false },
    }),
  });
  if (!res.ok) {
    throw new Error(`ZITADEL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const { userId } = (await res.json()) as { userId: string };

  // Rol `ruteo` (dueño): `ruteo_app` no tiene permiso sobre esta tabla.
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const admin = await db.platformAdmin.create({
    data: { email: email.toLowerCase(), name: nombre ?? null, externalId: userId },
  });
  await db.$disconnect();

  console.log(`Superadmin creado: ${admin.email}`);
  console.log(`  usuario en ZITADEL: ${loginName}`);
  console.log(`  entra en: ${process.env.PANEL_URL ?? 'http://localhost:3001'}/admin/login`);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
