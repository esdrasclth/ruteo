# Despliegue en el VPS de Contabo con Dokploy

Alternativa a `docs/despliegue-vps.md`, que describe el despliegue a mano con un
nginx del host delante. Aquí el proxy es **Traefik**, que Dokploy ya trae y que
saca los certificados de Let's Encrypt solo.

Lo que **no** cambia: los secretos, la rotación de contraseñas de Postgres, la
preparación de OSRM y todo el apartado «Qué cambia para los usuarios» de aquel
documento siguen aplicando tal cual. Este archivo cubre solo la parte que es
distinta por usar Dokploy.

## Por qué una sola aplicación «Compose» y no seis

Dokploy permite crear cada servicio por separado (una «Application» por el panel,
otra por la landing, una base de datos gestionada…). Aquí no sirve: el arranque
del backend depende de que el servicio `migraciones` haya terminado **bien**, y
esa dependencia (`condition: service_completed_successfully`) solo existe dentro
de un mismo Compose. Partiéndolo se pierde la garantía de que la API nunca sirva
contra un esquema que no le corresponde, que es justo lo que ese servicio
compra.

Por lo mismo, el proveedor tiene que ser **«Docker Compose»** y no **«Stack»**:
Swarm no entiende esa condición.

---

## 1. DNS

Tres registros `A` al IP del VPS de Contabo:

```
ruteo.brandsofts.com         A   <ip-del-vps>
panel.ruteo.brandsofts.com   A   <ip-del-vps>
api.ruteo.brandsofts.com     A   <ip-del-vps>
```

**Sin proxy de Cloudflare (nube gris).** El backend hace
`app.set('trust proxy', 1)`: cuenta **un** salto, y ese salto es Traefik. Con la
nube naranja hay dos, `request.ip` pasa a ser el de Traefik para siempre y el
límite por IP de login, recuperación de contraseña y rastreo público deja de
distinguir a nadie. Si quieres Cloudflare delante, hay que subir ese número en
`backend/src/main.ts` primero.

Propaga el DNS **antes** de configurar los dominios en Dokploy: Let's Encrypt
valida por HTTP-01 y falla si el nombre todavía no resuelve. Un fallo de emisión
entra en rate limit de la CA, y son cinco fallos por hora y dominio.

## 2. Preparar el VPS por SSH

Dos cosas que Dokploy no puede hacer desde la interfaz. Se hacen **una vez**.

### 2.1 Los volúmenes que no se deben perder

`docker-compose.dokploy.yml` declara `ruteo_pgdata` y `ruteo_osrmdata` como
externos: borrar la aplicación en Dokploy no se los lleva por delante, y su
nombre es estable para los scripts de respaldo. A cambio hay que crearlos:

```bash
docker volume create ruteo_pgdata
docker volume create ruteo_osrmdata
```

Si faltan, el despliegue falla de inmediato en vez de arrancar con una base
vacía. Es el comportamiento que se quiere.

### 2.2 Los artefactos de OSRM

El volumen viaja vacío y el contenedor `osrm` se queda reiniciándose hasta que
existan. Son ~420 MB y un minuto largo de CPU:

```bash
git clone https://github.com/<tu-usuario>/ruteo /tmp/ruteo-osrm
bash /tmp/ruteo-osrm/scripts/osrm-prepare.sh
rm -rf /tmp/ruteo-osrm
```

El script escribe dentro del volumen `ruteo_osrmdata`, no en el disco del host,
así que el clon temporal se puede borrar después.

Si no lo haces, todo lo demás funciona: el panel cae a líneas rectas en vez de
rutas por carretera. Pero conviene resolverlo antes de mirar los logs y
preguntarse por qué hay un contenedor en bucle.

## 3. Subir el repo a GitHub

Dokploy clona por Git, así que hace falta un remoto:

```bash
gh repo create ruteo --private --source=. --remote=origin
git push -u origin main
```

**Privado.** El repo no lleva secretos —`backend/.env` está en `.gitignore`—
pero sí el esquema completo, la lógica de RLS y los archivos de despliegue.

La rama que configures en Dokploy (paso 4) tiene que existir en el remoto y
contener `docker-compose.dokploy.yml`. Si el trabajo vive en una rama de
funcionalidad, fusiónala a `main` antes de desplegar: dejar `main` configurada
mientras el código está solo en la rama hace que Dokploy clone `main`, no
encuentre el compose y falle sin decir por qué.

En Dokploy, `Settings → Git → GitHub` instala la app de GitHub y le da acceso al
repo. Es lo que habilita el auto-deploy del paso 8. Si la app ya estaba instalada
para otros proyectos, un repo nuevo aparece solo si se instaló con acceso a
«todos los repositorios»; con acceso selectivo hay que añadirlo en GitHub.

## 4. Crear la aplicación en Dokploy

`Projects → Create Project` (por ejemplo `ruteo`) y dentro
`Create Service → Compose`.

En la pestaña **General**:

| Campo | Valor |
| --- | --- |
| Provider | GitHub |
| Repository | `<tu-usuario>/ruteo` |
| Branch | `main` (o la rama que despliegues) |
| Compose Path | `./docker-compose.dokploy.yml` |
| Compose Type | **Docker Compose** |

Y en **Advanced**, deja **Randomize Compose** apagado: le añade un sufijo
aleatorio a volúmenes y redes, y los dos volúmenes externos dejarían de
encontrarse. El de la base entre ellos.

## 5. Variables de entorno

Pestaña **Environment**. Pega el contenido de `.env.dokploy.example` y rellena
lo que falta. Genera cada secreto por separado:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 48   # PLATFORM_JWT_SECRET
openssl rand -base64 32   # REDIS_PASSWORD
openssl rand -base64 32   # POSTGRES_PASSWORD
```

Los tres de JWT **distintos entre sí**; el arranque lo comprueba y aborta si no.

Pon en `DATABASE_URL_DOCKER` y `DATABASE_URL_APP_DOCKER` las contraseñas
**definitivas** desde el principio, no las de la migración. La primera de las dos
funcionará de inmediato (Postgres inicializa el rol `ruteo` con el
`POSTGRES_PASSWORD` de este mismo Environment); la segunda no, hasta que rotes el
rol `ruteo_app` en el paso 7. Es una rotación, no una edición de variables: el
Environment ya queda bien puesto aquí y no se vuelve a tocar.

Genera las contraseñas de base de datos **en hexadecimal**, no en base64:
`openssl rand -base64` puede producir `/` y `+`, y una `/` dentro de la
contraseña parte la URL de conexión por donde no es.

```bash
openssl rand -hex 32   # POSTGRES_PASSWORD y la de ruteo_app
```

## 6. Dominios

Pestaña **Domains**, un dominio por servicio. Dokploy escribe las etiquetas de
Traefik y pide el certificado:

| Service Name | Host | Container Port | HTTPS | Certificate |
| --- | --- | --- | --- | --- |
| `landing` | `ruteo.brandsofts.com` | `3003` | sí | Let's Encrypt |
| `frontend` | `panel.ruteo.brandsofts.com` | `3001` | sí | Let's Encrypt |
| `backend` | `api.ruteo.brandsofts.com` | `3000` | sí | Let's Encrypt |

Los puertos son los que fija cada `Dockerfile` (`ENV PORT`), no los del host: en
este compose ningún servicio publica puertos, Traefik llega por la red interna.

`db`, `redis`, `osrm` y `migraciones` **no llevan dominio** y ni siquiera están
en `dokploy-network`: viven en la red `interna` de la aplicación y no son
alcanzables desde fuera ni desde el resto de aplicaciones del servidor.

## 7. Primer despliegue

**Deploy.** El orden que verás en los logs: `db` y `redis` sanos →
`migraciones` corre y termina → `backend`, `frontend` y `landing` arrancan.

Salvo que el backend no llegará a servir: se queda sin poder conectar como
`ruteo_app`. Es lo esperado en el primer despliegue.

> Por qué: la migración `20260712203500_rls_setup` crea el rol de aplicación con
> la contraseña escrita en el propio SQL (`ruteo_app`), y no se puede
> parametrizar desde una migración de Prisma. Hasta que esa migración no ha
> corrido, el rol no existe; y en cuanto existe, su contraseña no es la que dice
> `DATABASE_URL_APP_DOCKER`.

Solo hay que rotar **una**, no dos. `ALTER ROLE ruteo` no hace falta: ese rol lo
crea Postgres al inicializarse con el `POSTGRES_PASSWORD` que pusiste en el
Environment, así que ya nace con la contraseña buena. (El apartado 2 de
`docs/despliegue-vps.md` rota las dos porque está escrito para un despliegue que
arrancó con `POSTGRES_PASSWORD=ruteo`.)

Por SSH:

```bash
# Nombre del proyecto Compose que usó Dokploy. NO es el App Name que escribiste:
# Dokploy le añade un sufijo aleatorio. En este despliegue: ruteo-stack-shc0uh
docker compose ls

docker compose -p ruteo-stack-shc0uh exec db psql -U ruteo -d ruteo \
  -c "ALTER ROLE ruteo_app PASSWORD '<la-de-DATABASE_URL_APP_DOCKER>';"
```

No hace falta reiniciar nada: el backend está en bucle de reinicio
(`restart: unless-stopped`), así que en el siguiente intento —segundos— conecta
solo. Y **sin tocar el Environment**: la cadena ya tenía la contraseña correcta,
era el rol el que no la tenía.

El error que verás en los logs hasta ese momento, para reconocerlo:

```
PrismaClientInitializationError: Authentication failed against database server,
the provided database credentials for `ruteo_app` are not valid.   (P1000)
```

### El primer superadmin

```bash
docker compose -p ruteo-stack-shc0uh -f /etc/dokploy/compose/ruteo-stack-shc0uh/code/docker-compose.dokploy.yml \
  run --rm backend node dist/scripts/crear-superadmin.js
```

(`ls /etc/dokploy/compose` confirma la ruta si el sufijo cambió.)

## 8. Comprobaciones

```bash
curl -I https://ruteo.brandsofts.com
curl    https://api.ruteo.brandsofts.com/api/health/ready
curl -I https://panel.ruteo.brandsofts.com/login
```

Que la infraestructura **no** asome al host — solo deben verse los puertos de
Traefik y el de Dokploy, nunca 5432, 6379 ni 5000:

```bash
ss -tlnp | grep -E '5432|6379|5000' && echo "MAL: hay infraestructura publicada"
```

Y desde fuera del VPS, esto debe dar timeout:

```bash
nc -zv <ip-del-vps> 5432
```

En el firewall de Contabo (o UFW), abiertos solo 22, 80 y 443. El **3000 de la
interfaz de Dokploy conviene cerrarlo** y llegar a ella por un dominio con TLS
—Dokploy se autoconfigura uno desde `Settings → Server`— o por un túnel SSH:
`ssh -L 3000:localhost:3000 <vps>`. Dejarlo abierto expone el panel que controla
todos los contenedores de la máquina, en HTTP plano.

## 9. Actualizaciones

Con la app de GitHub instalada, activa **Auto Deploy** en la pestaña General:
cada push a la rama configurada reconstruye y redespliega. El servicio
`migraciones` corre en cada despliegue —`prisma migrate deploy` es idempotente—
y si una migración falla, el backend viejo se queda sirviendo y el despliegue
queda en rojo.

Dos cosas que **no** basta con redesplegar:

- **Cambiar `PUBLIC_API_URL`, `PUBLIC_PANEL_URL` o `PUBLIC_SITE_URL`.** Se
  incrustan en el JavaScript del navegador durante `next build`. Hay que
  reconstruir la imagen, no reiniciar el contenedor.
- **Cambiar `REDIS_PASSWORD`.** Configura el contenedor de Redis y el cliente del
  backend a la vez; si solo se redespliega uno, el backend entra en bucle de
  `NOAUTH`.

## 10. Respaldos

`ruteo_pgdata` es el **único** volumen irrecuperable: el de OSRM se regenera con
`scripts/osrm-prepare.sh` y Redis es caché y colas.

Los scripts del repo (`respaldo-db.sh`, `restaurar-db.sh`) funcionan bajo
Dokploy, pero hay que decirles dónde está el compose y con qué nombre de
proyecto corre, porque no es el del directorio:

```bash
cd /etc/dokploy/compose/ruteo-stack-shc0uh/code

export COMPOSE_FILE=docker-compose.dokploy.yml
export COMPOSE_PROJECT_NAME=ruteo-stack-shc0uh   # confirmalo con `docker compose ls`

./scripts/respaldo-db.sh
```

Sin `COMPOSE_PROJECT_NAME`, `docker compose` deduce el proyecto del nombre del
directorio (`code`), no encuentra el servicio `db` y el script falla con un «no
such service» que no dice nada del motivo real.

En el crontab del VPS:

```bash
0 3 * * *  cd /etc/dokploy/compose/ruteo-stack-shc0uh/code && COMPOSE_FILE=docker-compose.dokploy.yml COMPOSE_PROJECT_NAME=ruteo-stack-shc0uh ./scripts/respaldo-db.sh >> /var/log/ruteo-respaldo.log 2>&1
```

**Ojo con el directorio**: Dokploy lo reescribe en cada despliegue (`git clone`
limpio). Los scripts sobreviven porque vienen del repo, pero cualquier cosa que
edites ahí a mano se pierde en el siguiente push.

**Un respaldo sin restauración probada no es un respaldo.** La prueba no toca
producción —restaura en una base temporal al lado, cuenta filas y la borra—:

```bash
./scripts/restaurar-db.sh --probar /var/backups/ruteo/ruteo-<fecha>.dump
```

Y siguen quedando en el mismo disco que la base. Copiarlos fuera (`rclone` a un
bucket, `scp` a otra máquina) es lo que convierte esto en un respaldo de verdad.
Dokploy trae destinos S3 en `Settings → Destinations`, pero su función de
backups automáticos aplica a bases creadas como servicio de Dokploy, no a una
que vive dentro de un Compose como esta.

## Diferencias con `docs/despliegue-vps.md`

| | A mano | Dokploy |
| --- | --- | --- |
| Compose | `docker-compose.prod.yml` | `docker-compose.dokploy.yml` |
| Puertos al host | 3000/3001/3003 en loopback | ninguno |
| Proxy y TLS | nginx del host + certbot | Traefik, automático |
| Variables | `.env` + `backend/.env` en disco | pestaña Environment |
| Despliegue | `docker compose up -d --build` por SSH | push a GitHub |
| `container_name` | fijos | los pone Dokploy |

El apartado 4 de aquel documento (cabeceras del proxy, `X-Forwarded-For`) lo
resuelve Traefik por su cuenta. Todo lo demás —secretos, rotación de
contraseñas, qué cambia para los usuarios, lo pendiente— sigue vigente.
