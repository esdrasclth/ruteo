-- Datos de contacto y fiscales de la empresa.
--
-- Todas nulables, y no por comodidad: el alta NO las pide. Un registro con
-- cinco campos más convierte peor, y ninguno de estos hace falta para que la
-- cuenta funcione. Se rellenan desde el panel, y se EXIGEN en el punto donde de
-- verdad importan —activar un plan de pago—, no antes.
--
-- `phone` sí se pide en el alta: es por donde se cierra la activación de un
-- plan de prueba.
ALTER TABLE "tenants"
  ADD COLUMN "phone"           TEXT,
  ADD COLUMN "legal_name"      TEXT,
  ADD COLUMN "tax_id"          TEXT,
  ADD COLUMN "billing_email"   TEXT,
  ADD COLUMN "billing_address" TEXT;
