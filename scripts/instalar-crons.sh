#!/usr/bin/env bash
#
# Deja instalados los dos trabajos periódicos del VPS:
#
#   - respaldo diario de Postgres
#   - renovación semanal del certificado comodín
#
#   sudo ./scripts/instalar-crons.sh
#
# Es idempotente: se puede volver a correr después de cada despliegue para
# refrescar los scripts, y no duplica las líneas del crontab.
#
# ---------------------------------------------------------------------------
# Por qué un instalador y no dos líneas pegadas a mano en `crontab -e`
#
# Las líneas obvias apuntarían a /etc/dokploy/compose/<appName>/code, que es
# donde Dokploy clona el repo. Ese directorio tiene dos problemas para un cron:
# Dokploy lo BORRA y lo vuelve a clonar en cada despliegue, y el <appName> lleva
# un sufijo aleatorio que cambia si algún día se recrea el servicio.
#
# Un cron anclado ahí funciona meses y un día deja de hacerlo. El del respaldo
# se nota cuando hace falta restaurar; el del certificado, cuando caduca y
# ninguna empresa puede entrar. Los dos fallos son silenciosos hasta que son
# caros.
#
# Por eso los scripts se COPIAN a /usr/local/sbin, que no lo toca nadie.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Esto tiene que correr como root: sudo $0" >&2
  exit 1
fi

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO_BIN=/usr/local/sbin
CONF=/etc/ruteo
ENTORNO="${CONF}/cron.env"

echo "==> copiando scripts a ${DESTINO_BIN}"
install -m 755 "${AQUI}/respaldo-db.sh"  "${DESTINO_BIN}/ruteo-respaldo-db"
install -m 755 "${AQUI}/cert-comodin.sh" "${DESTINO_BIN}/ruteo-cert-comodin"

mkdir -p "$CONF"

# El token NO va en la línea del crontab. Dos motivos: el crontab de root se
# lee entero con `sudo crontab -l`, y cuando cron lanza la tarea el valor
# aparece en la línea de comandos del proceso, visible en `ps` para cualquier
# usuario de la máquina. En un archivo 600 no pasa ninguna de las dos cosas.
if [[ ! -f "$ENTORNO" ]]; then
  cat > "$ENTORNO" <<'EOF'
# Token de Cloudflare para renovar el certificado comodín.
# Acotado: Zone:DNS:Edit + Zone:Zone:Read sobre la zona, y con filtro de IP.
CF_DNS_API_TOKEN=

# Contenedor de Postgres. Se apunta por nombre y no por el compose, para no
# depender del directorio que Dokploy reescribe en cada despliegue.
# Confirmar con: docker ps | grep db
RUTEO_DB_CONTAINER=ruteo-stack-shc0uh-db-1
EOF
  chmod 600 "$ENTORNO"
  echo "==> creado ${ENTORNO} (600). RELLENA CF_DNS_API_TOKEN antes de seguir."
else
  echo "==> ${ENTORNO} ya existe, no se toca"
fi

# `set -a` exporta todo lo que se lea del archivo, que es lo que necesitan los
# scripts. Sin él, las variables quedarían solo en este shell.
instalar_linea() {
  local marca="$1" linea="$2"
  local actual
  actual="$(crontab -l 2>/dev/null || true)"
  # Se borra cualquier versión anterior de ESTA tarea antes de añadir la nueva,
  # que es lo que hace que reejecutar el instalador no acumule duplicados.
  printf '%s\n' "$actual" | grep -v -F "$marca" | grep -v '^$' > /tmp/crontab.ruteo || true
  printf '%s\n' "$linea" >> /tmp/crontab.ruteo
  crontab /tmp/crontab.ruteo
  rm -f /tmp/crontab.ruteo
}

echo "==> instalando las tareas en el crontab de root"

# 03:00 diario. `set -a` + source del archivo de entorno, y luego el script.
instalar_linea "# ruteo-respaldo" \
  "0 3 * * * set -a; . ${ENTORNO}; set +a; ${DESTINO_BIN}/ruteo-respaldo-db >> /var/log/ruteo-respaldo.log 2>&1  # ruteo-respaldo"

# Lunes 04:17. Semanal aunque solo actúe cuando quedan menos de ~30 días: si un
# lunes falla, quedan varios intentos antes de que el certificado importe.
# El minuto 17 y no el 0 para no coincidir con la avalancha de tareas en punto.
instalar_linea "# ruteo-cert" \
  "17 4 * * 1 set -a; . ${ENTORNO}; set +a; ${DESTINO_BIN}/ruteo-cert-comodin >> /var/log/ruteo-cert.log 2>&1  # ruteo-cert"

echo
echo "==> crontab de root:"
crontab -l | grep -E "ruteo-(respaldo|cert)" || true

echo
echo "Comprobación manual, sin esperar a que salten:"
echo "  set -a; . ${ENTORNO}; set +a; ${DESTINO_BIN}/ruteo-respaldo-db"
echo "  set -a; . ${ENTORNO}; set +a; ${DESTINO_BIN}/ruteo-cert-comodin"
echo
echo "Un respaldo sin restauración probada no es un respaldo. Pruébala hoy:"
echo "  RUTEO_DB_CONTAINER=... ${AQUI}/restaurar-db.sh --probar /var/backups/ruteo/<archivo>.dump"
