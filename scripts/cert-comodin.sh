#!/usr/bin/env bash
#
# Certificado comodín para `*.ruteo.brandsofts.com`, que es lo que permite que
# cada empresa entre por su propio subdominio.
#
#   sudo CF_DNS_API_TOKEN=... ./scripts/cert-comodin.sh
#
# Y en el crontab de root, para que se renueve solo:
#
#   17 4 * * 1  CF_DNS_API_TOKEN=... /ruta/scripts/cert-comodin.sh >> /var/log/ruteo-cert.log 2>&1
#
# ---------------------------------------------------------------------------
# Por qué esto y no el ACME de Traefik
#
# Let's Encrypt no emite comodines por HTTP-01, que es el único desafío que
# Dokploy configura. Hacerlo con el ACME de Traefik obliga a meterle
# `CF_DNS_API_TOKEN` al contenedor `dokploy-traefik`, y ese contenedor lo
# recrea Dokploy en cada actualización: la variable desaparece, la renovación
# deja de funcionar y no se entera nadie hasta que el certificado caduca tres
# meses después.
#
# Así, el certificado es un archivo que Traefik lee por configuración dinámica
# —que vigila y recarga sola— y la renovación es este cron, que se ve.
#
# El precio: si esto deja de correr, el certificado caduca. Por eso avisa por
# código de salida y conviene mirar el log. Un fallo aquí es visible; el otro
# no lo era.
set -euo pipefail

: "${CF_DNS_API_TOKEN:?define CF_DNS_API_TOKEN (token acotado: Zone:DNS:Edit sobre la zona)}"

DOMINIO_BASE="${RUTEO_DOMINIO_BASE:-ruteo.brandsofts.com}"
CORREO="${RUTEO_ACME_EMAIL:-esdras.clother@outlook.com}"

# Dos directorios distintos, y la separación importa.
#
# TRABAJO es donde lego guarda lo suyo: los certificados y, sobre todo,
# `accounts/`, que contiene la clave privada de la cuenta ACME. Con ella se
# pueden pedir certificados a tu nombre.
#
# PUBLICADO es lo único que ve Traefik. El contenedor `dokploy-traefik` monta
# EXACTAMENTE `/etc/dokploy/traefik/dynamic` y el `traefik.yml`, nada más
# (compruébalo con `docker inspect dokploy-traefik`), así que el certificado
# tiene que vivir ahí dentro a la fuerza. Se copian solo el .crt y el .key: la
# clave de la cuenta se queda fuera del directorio que Traefik recorre.
TRABAJO="${RUTEO_ACME_DIR:-/etc/dokploy/ruteo-acme}"
PUBLICADO="${RUTEO_CERT_DIR:-/etc/dokploy/traefik/dynamic/certificates}"
IMAGEN="goacme/lego:latest"

mkdir -p "$TRABAJO" "$PUBLICADO"
chmod 700 "$TRABAJO"

# lego decide solo entre pedir y renovar según lo que encuentre en --path, pero
# `renew` sobre un certificado que no existe falla, y `run` sobre uno que sí
# existe lo pide otra vez y gasta cuota. Así que se elige aquí.
#
# El nombre del archivo lo fija lego: el `*` del comodín se convierte en `_`.
ORIGEN="${TRABAJO}/certificates/_.${DOMINIO_BASE}"
if [[ -f "${ORIGEN}.crt" ]]; then
  ACCION=(renew --days 30)
  echo "[$(date -Is)] renovando si quedan menos de 30 días"
else
  ACCION=(run)
  echo "[$(date -Is)] primera emisión"
fi

# `--dns cloudflare` toma CF_DNS_API_TOKEN del entorno. Se pasa con `-e VAR` sin
# valor a propósito: así el token no aparece en la línea de comandos, que
# cualquier usuario de la máquina puede leer con `ps`.
#
# El volumen va a `/data` y NO a `/lego`: en esta imagen `/lego` es el propio
# binario, y montar un directorio encima falla con «not a directory», un error
# que suena a problema del host y no lo es.
docker run --rm \
  -e CF_DNS_API_TOKEN \
  -v "${TRABAJO}:/data" \
  "$IMAGEN" \
  --accept-tos \
  --email "$CORREO" \
  --dns cloudflare \
  --path /data \
  --domains "*.${DOMINIO_BASE}" \
  --domains "${DOMINIO_BASE}" \
  "${ACCION[@]}"

# `renew` no toca nada si al certificado le quedan más de 30 días, así que
# copiar siempre es inútil pero inofensivo… salvo por un detalle: copiar
# reescribe el archivo, Traefik ve el cambio y recarga sin necesidad. Se copia
# solo si el de origen es más nuevo.
install -m 644 -C "${ORIGEN}.crt" "${PUBLICADO}/ruteo-comodin.crt"
# La clave privada del comodín de TODAS las empresas. 600 y no 644.
install -m 600 -C "${ORIGEN}.key" "${PUBLICADO}/ruteo-comodin.key"

echo "[$(date -Is)] publicado en ${PUBLICADO}/ruteo-comodin.{crt,key}"
echo '  Traefik lo recarga solo: lo declara dynamic/ruteo-comodin.yml y file.watch está activo.'
# Fecha de caducidad al log: es lo que se mira cuando algo va mal, y tenerlo en
# cada ejecución convierte el log en un historial de renovaciones.
openssl x509 -enddate -noout -in "${PUBLICADO}/ruteo-comodin.crt" 2>/dev/null || true
