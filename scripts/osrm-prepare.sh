#!/usr/bin/env bash
# Genera los artefactos de enrutamiento de OSRM dentro del volumen de Docker.
#
# Se corre UNA vez (y cada vez que se quiera refrescar el mapa de OpenStreetMap).
# El volumen no viaja en el repo, así que en una máquina nueva `docker compose up`
# dejará el contenedor `ruteo-osrm` reiniciándose hasta que esto se ejecute.
#
#   bash scripts/osrm-prepare.sh
#
# Todo ocurre dentro del volumen, no en el disco del host: el extracto y los
# artefactos suman ~420 MB para Honduras.
set -euo pipefail

VOLUMEN="${OSRM_VOLUME:-ruteo_osrmdata}"
IMAGEN="ghcr.io/project-osrm/osrm-backend:latest"
# Solo Honduras: los tramos internacionales del negocio van por aire y se
# dibujan como arcos, no necesitan red de carreteras.
EXTRACTO="${OSRM_EXTRACT_URL:-https://download.geofabrik.de/central-america/honduras-latest.osm.pbf}"
BASE="honduras"

echo "==> volumen $VOLUMEN"
docker volume create "$VOLUMEN" >/dev/null

echo "==> descargando extracto de OpenStreetMap"
docker run --rm -v "$VOLUMEN":/data alpine sh -c \
  "apk add --no-cache wget >/dev/null 2>&1 && wget -q -O /data/$BASE.osm.pbf '$EXTRACTO'"

# MLD (multi-level Dijkstra): extract -> partition -> customize. Es el pipeline
# que corresponde a `osrm-routed --algorithm mld` del docker-compose.
echo "==> osrm-extract (perfil coche)"
docker run --rm -v "$VOLUMEN":/data "$IMAGEN" \
  osrm-extract -p /opt/car.lua "/data/$BASE.osm.pbf"

echo "==> osrm-partition"
docker run --rm -v "$VOLUMEN":/data "$IMAGEN" osrm-partition "/data/$BASE.osrm"

echo "==> osrm-customize"
docker run --rm -v "$VOLUMEN":/data "$IMAGEN" osrm-customize "/data/$BASE.osrm"

echo "==> listo. Ahora: docker compose up -d osrm"
