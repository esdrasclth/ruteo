-- Cobrar un cargo deja de ser un hecho suelto y pasa a colgar de un pago.
--
-- Hasta ahora `charges` sabia si algo estaba pagado (`status`, `paid_at`) pero
-- no CON QUE se pago, y `payments` no sabia que estaba saldando. Eran dos
-- verdades separadas sobre el mismo dinero: la caja cuadraba o no cuadraba y no
-- habia por donde empezar a mirar.

-- El pago que salda cargos de un envio. No es COD —que lo cobra el repartidor
-- contra entrega— ni SUBSCRIPTION, que es lo que la empresa nos paga a nosotros.
ALTER TYPE "PaymentType" ADD VALUE 'CHARGES';

-- N cargos -> 1 pago. Asi ocurre en el mostrador: el cliente paga el total, no
-- una linea por concepto.
ALTER TABLE "charges" ADD COLUMN "payment_id" UUID;

CREATE INDEX "charges_payment_id_idx" ON "charges"("payment_id");

-- SET NULL y no CASCADE: si el pago desaparece, el cargo sigue existiendo. Se
-- cobro de verdad, y lo que se pierde es el respaldo, no la deuda. Con CASCADE,
-- borrar un pago mal registrado se llevaria por delante lo facturado.
ALTER TABLE "charges" ADD CONSTRAINT "charges_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Sin politica RLS nueva: `charges` ya la tiene desde `cargos_separados` y aqui
-- solo se le agrega una columna. Ojo con lo que la clave foranea NO cubre:
-- Postgres salta el RLS al comprobar integridad referencial, asi que la base
-- aceptaria un cargo apuntando al pago de otra empresa. Quien lo impide es el
-- servicio, que crea el pago y marca los cargos dentro de la misma transaccion
-- con el contexto del tenant fijado.
