#!/usr/bin/env bash
#
# Respaldo de Postgres. Pensado para el cron del VPS:
#
#   0 3 * * *  cd /srv/ruteo && ./scripts/respaldo-db.sh >> /var/log/ruteo-respaldo.log 2>&1
#
# `ruteo_pgdata` es el ÚNICO volumen que no se puede reconstruir: el de OSRM se
# regenera con `osrm-prepare.sh` y Redis es caché y colas. Si se pierde este, se
# perdió el negocio.
#
# Usa `pg_dump -Fc` (formato comprimido de Postgres) y no SQL plano porque
# permite restaurar tablas sueltas con `pg_restore -t`, que es lo que se
# necesita cuando lo que hay que deshacer es un borrado concreto y no la base
# entera.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DESTINO="${RUTEO_BACKUP_DIR:-/var/backups/ruteo}"
# Cuántos días se conservan. Un mes cubre el caso realista —"esto se borró hace
# tres semanas y nadie se dio cuenta"— sin llenar el disco de un VPS.
RETENCION_DIAS="${RUTEO_BACKUP_RETENTION_DAYS:-30}"

USUARIO="${POSTGRES_USER:-ruteo}"
BASE="${POSTGRES_DB:-ruteo}"

marca="$(date +%Y%m%d-%H%M%S)"
archivo="${DESTINO}/ruteo-${marca}.dump"

mkdir -p "$DESTINO"

echo "[$(date -Is)] respaldando ${BASE} -> ${archivo}"

# El volcado sale por stdout del contenedor y se escribe aquí. `-T` desactiva la
# TTY: sin él, docker mete retornos de carro en el flujo y el archivo resultante
# queda corrupto de una forma que solo se descubre al intentar restaurarlo.
#
# Se escribe primero a `.parcial` y se renombra al final: si el proceso muere a
# medias, no queda un archivo a medio escribir con nombre de respaldo bueno,
# que es la clase de cosa que solo se nota el día que hace falta.
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$USUARIO" -d "$BASE" -Fc > "${archivo}.parcial"

mv "${archivo}.parcial" "$archivo"

tamano="$(du -h "$archivo" | cut -f1)"
echo "[$(date -Is)] listo: ${archivo} (${tamano})"

# Comprobación de que el archivo es un volcado íntegro y no cero bytes, un
# mensaje de error redirigido o un archivo truncado.
#
# `pg_restore --list` NO sirve por tubería: el formato comprimido necesita
# reposicionarse dentro del archivo, y contra `/dev/stdin` falla incluso con un
# volcado perfecto. Comprobado. Por eso se le pasa siempre un archivo de verdad:
# el del host si hay cliente de Postgres instalado, y si no, el mismo archivo
# montado de solo lectura en un contenedor de usar y tirar —la imagen ya está
# descargada y no cuesta disco adicional—.
verificar_volcado() {
  if command -v pg_restore > /dev/null 2>&1; then
    pg_restore --list "$1" > /dev/null 2>&1
    return $?
  fi
  docker run --rm -v "$(cd "$(dirname "$1")" && pwd):/respaldos:ro" \
    postgres:16-alpine \
    pg_restore --list "/respaldos/$(basename "$1")" > /dev/null 2>&1
}

if ! verificar_volcado "$archivo"; then
  echo "[$(date -Is)] ERROR: el volcado no es legible; se conserva para inspección" >&2
  exit 1
fi
echo "[$(date -Is)] volcado íntegro"

borrados="$(find "$DESTINO" -name 'ruteo-*.dump' -type f -mtime "+${RETENCION_DIAS}" -print -delete | wc -l)"
echo "[$(date -Is)] rotación: ${borrados} respaldo(s) de más de ${RETENCION_DIAS} días"

# Los respaldos siguen en el MISMO disco que la base. Un `rm -rf` desafortunado,
# un fallo del disco o que el proveedor pierda la máquina se los lleva con ella.
# Copiarlos fuera es un paso aparte y hace falta: ver docs/despliegue-vps.md.
