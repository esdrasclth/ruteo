-- Foto de perfil de cada persona del equipo.
--
-- Apunta al `FileObject` y no guarda una URL: las URLs de este sistema se
-- firman al leer y caducan en minutos, asi que una columna con una URL seria
-- una columna con un pase muerto. `SET NULL` porque quedarse sin foto no puede
-- llevarse por delante al usuario.
--
-- Sin RLS que anadir: `users` ya la tiene desde el principio.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_file_id" UUID;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

