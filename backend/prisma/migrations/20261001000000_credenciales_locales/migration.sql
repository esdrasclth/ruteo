-- Las contraseñas vuelven a Postgres: se deja de depender de ZITADEL.
--
-- `password_hash` es NULL-able a propósito. Las cuentas que existían en ZITADEL
-- llegan aquí SIN contraseña —sus hashes no salen del proveedor— y una cuenta
-- sin hash no entra con ninguna contraseña (falla cerrada). Recuperan el acceso
-- con «¿Olvidaste tu contraseña?» o con un restablecimiento del administrador.
-- Lo mismo vale para un invitado que todavía no eligió la suya.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
DROP INDEX IF EXISTS "users_external_id_key";
ALTER TABLE "users" DROP COLUMN "external_id";

-- AlterTable
ALTER TABLE "platform_admins" ADD COLUMN "password_hash" TEXT;
DROP INDEX IF EXISTS "platform_admins_external_id_key";
ALTER TABLE "platform_admins" DROP COLUMN "external_id";
