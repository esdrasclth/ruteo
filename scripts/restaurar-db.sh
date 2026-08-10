#!/usr/bin/env bash
#
# Restaura un respaldo, o comprueba que se puede restaurar.
#
#   ./scripts/restaurar-db.sh --probar /var/backups/ruteo/ruteo-20260809-030000.dump
#   ./scripts/restaurar-db.sh --en-serio /var/backups/ruteo/ruteo-20260809-030000.dump
#
# **Un respaldo sin restauración probada no es un respaldo.** El modo `--probar`
# existe para que esa prueba sea barata y se haga de verdad: restaura sobre una
# base temporal al lado, cuenta unas cuantas filas y la borra. No toca nada de
# producción, así que se puede correr un martes cualquiera.
#
# `--en-serio` es el de un desastre real: SOBRESCRIBE la base de producción.
# Pide confirmación escrita porque no hay deshacer.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
USUARIO="${POSTGRES_USER:-ruteo}"
BASE="${POSTGRES_DB:-ruteo}"

modo="${1:-}"
archivo="${2:-}"

if [[ "$modo" != "--probar" && "$modo" != "--en-serio" ]] || [[ -z "$archivo" ]]; then
  echo "uso: $0 --probar|--en-serio <archivo.dump>" >&2
  exit 2
fi

if [[ ! -f "$archivo" ]]; then
  echo "no existe: $archivo" >&2
  exit 2
fi

psql_en_db() {
  docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$USUARIO" -v ON_ERROR_STOP=1 "$@"
}

if [[ "$modo" == "--probar" ]]; then
  temporal="ruteo_prueba_restauracion_$(date +%s)"
  echo "Restaurando en la base temporal ${temporal}…"

  # `postgres` como base de conexión: no se puede crear una base estando
  # conectado a la que se va a crear.
  psql_en_db -d postgres -c "CREATE DATABASE \"${temporal}\";"

  limpiar() {
    echo "Limpiando ${temporal}…"
    psql_en_db -d postgres -c "DROP DATABASE IF EXISTS \"${temporal}\";" || true
  }
  trap limpiar EXIT

  # `--no-owner --no-privileges`: el volcado trae los roles de producción
  # (`ruteo_app` y sus GRANT), y en una base recién creada eso genera ruido que
  # no dice nada sobre si los DATOS están bien, que es lo que se comprueba aquí.
  docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_restore -U "$USUARIO" -d "$temporal" --no-owner --no-privileges < "$archivo"

  echo
  echo "Filas recuperadas por tabla (las que sostienen el negocio):"
  psql_en_db -d "$temporal" -c "
    SELECT 'tenants'   AS tabla, count(*) FROM tenants
    UNION ALL SELECT 'users',     count(*) FROM users
    UNION ALL SELECT 'shipments', count(*) FROM shipments
    UNION ALL SELECT 'customers', count(*) FROM customers
    UNION ALL SELECT 'payments',  count(*) FROM payments
    ORDER BY tabla;"

  echo
  echo "Restauración PROBADA. La base temporal se borra al salir."
  exit 0
fi

echo "*******************************************************************"
echo "  Vas a SOBRESCRIBIR la base de producción '${BASE}'."
echo "  Todo lo que haya ahora se pierde y se sustituye por:"
echo "    ${archivo}"
echo "*******************************************************************"
read -r -p "Escribe RESTAURAR para continuar: " confirmacion
if [[ "$confirmacion" != "RESTAURAR" ]]; then
  echo "Cancelado."
  exit 1
fi

echo "Parando las aplicaciones para que nadie escriba durante la restauración…"
docker compose -f "$COMPOSE_FILE" stop backend frontend landing

# `--clean --if-exists` deja que el propio volcado tire y recree los objetos, en
# vez de borrar la base entera: así no hay que lidiar con las conexiones abiertas
# ni recrear los roles que viven fuera de ella.
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_restore -U "$USUARIO" -d "$BASE" --clean --if-exists < "$archivo"

echo "Levantando de nuevo…"
docker compose -f "$COMPOSE_FILE" start backend frontend landing

echo "Hecho. Revisa que /api/health/ready responda y entra al panel antes de dar por buena la restauración."
