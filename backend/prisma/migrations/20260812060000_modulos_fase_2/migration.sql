-- Módulos nuevos del panel.
--
-- Van en su propia migración y no en la de las tablas porque `ALTER TYPE ... ADD
-- VALUE` no puede correr dentro de una transacción junto a otras operaciones en
-- algunas versiones de Postgres, y porque separar el catálogo de la estructura
-- hace evidente qué se le está ofreciendo a los tenants.
ALTER TYPE "TenantModule" ADD VALUE IF NOT EXISTS 'MANIFESTS';
ALTER TYPE "TenantModule" ADD VALUE IF NOT EXISTS 'EXCEPTIONS';
