-- Índices compuestos para los listados operativos y sus filtros más usados.
-- Incluyen tenant primero para que RLS no fuerce un recorrido global.
CREATE INDEX "customers_tenant_created_id_idx"
  ON "customers" ("tenant_id", "created_at" DESC, "id" DESC);

CREATE INDEX "shipments_tenant_status_created_idx"
  ON "shipments" ("tenant_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "shipments_tenant_type_created_idx"
  ON "shipments" ("tenant_id", "type", "created_at" DESC, "id" DESC);
CREATE INDEX "shipments_tenant_created_id_idx"
  ON "shipments" ("tenant_id", "created_at" DESC, "id" DESC);

CREATE INDEX "exceptions_tenant_status_created_id_idx"
  ON "exceptions" ("tenant_id", "status", "created_at" DESC, "id" DESC);

CREATE INDEX "routes_tenant_scheduled_id_idx"
  ON "routes" ("tenant_id", "scheduled_date" DESC, "id" DESC);
