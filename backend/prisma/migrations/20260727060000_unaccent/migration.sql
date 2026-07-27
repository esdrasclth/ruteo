-- Búsqueda insensible a acentos.
--
-- `mode: 'insensitive'` de Prisma solo ignora mayúsculas: buscar "lopez" no
-- encuentra "López". En un panel en español eso es un fallo de uso diario,
-- porque casi nadie escribe las tildes al buscar.
--
-- La extensión la crea el rol owner de las migraciones; `unaccent()` queda
-- ejecutable por PUBLIC, así que el rol de aplicación puede usarla.
CREATE EXTENSION IF NOT EXISTS unaccent;
