# Despliegue en VPS

Lo que el código **no** puede hacer por sí solo. El arranque en producción
comprueba buena parte de esto y se niega a levantar si falta (ver
`backend/src/config/env.validation.ts`), pero los pasos de aquí hay que darlos.

## 0. Resumen: el despliegue entero

```bash
git clone <repo> /srv/ruteo && cd /srv/ruteo

cp .env.example .env                  # secretos + URLs públicas (pasos 1 y 5)
cp backend/.env.example backend/.env  # secretos del backend (paso 1)
# …rellenar los dos…

./scripts/osrm-prepare.sh             # una vez: ~1 min, ~420 MB
docker compose -f docker-compose.prod.yml up -d --build

# El servicio `migraciones` corre solo y el backend espera a que termine bien.
docker compose -f docker-compose.prod.yml ps

# AHORA rotar las contraseñas de Postgres (paso 2) y reconstruir:
docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` levanta las tres aplicaciones además de la
infraestructura, cada una como usuario sin privilegios y con healthcheck. Lo
único que asoma al host son tres puertos en loopback (3000 backend, 3001 panel,
3003 landing); Postgres, Redis y OSRM **no se publican en ningún sitio**. Delante
va el proxy del paso 4.

## 1. Secretos

Genera cada uno por separado. Los tres de JWT deben ser **distintos entre sí**:
compartir el de tenant con el de plataforma anula la separación del panel de
superadmin.

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 48   # PLATFORM_JWT_SECRET
openssl rand -base64 32   # REDIS_PASSWORD  (mismo valor en la raíz y en backend/.env)
openssl rand -base64 32   # POSTGRES_PASSWORD
```

## 2. Rotar las contraseñas de Postgres — obligatorio

La migración `20260712203500_rls_setup` crea el rol de aplicación con la
contraseña escrita en el propio SQL:

```sql
CREATE ROLE ruteo_app LOGIN PASSWORD 'ruteo_app' NOSUPERUSER NOBYPASSRLS;
```

No se puede parametrizar desde una migración de Prisma, y en un despliegue nuevo
sobrevive tal cual. **Después** de `prisma migrate deploy`:

```bash
docker compose exec db psql -U ruteo -d ruteo \
  -c "ALTER ROLE ruteo_app PASSWORD '<la-generada>';" \
  -c "ALTER ROLE ruteo     PASSWORD '<la-otra-generada>';"
```

Y actualiza `DATABASE_URL` y `DATABASE_URL_APP` en `backend/.env`. El arranque
detecta las contraseñas por defecto en la cadena de conexión y aborta, así que
si te lo saltas te enterarás en el primer `docker compose up`.

## 3. Puertos

En producción, Postgres, Redis y OSRM **no se publican en ningún puerto del
host**: el backend les llega por la red interna de Compose. El de desarrollo sí
los publica en 127.0.0.1, porque allí el backend corre fuera de Docker.

No lo cambies: las reglas que Docker escribe en iptables se evalúan antes que
las de UFW, así que un puerto publicado en `0.0.0.0` queda abierto a internet
aunque el firewall diga lo contrario.

Por lo mismo `docker-compose.prod.yml` es un archivo aparte y no una
superposición del de desarrollo: al superponer, Compose **suma** las listas de
`ports` en vez de reemplazarlas, así que una superposición no podría quitar esa
publicación. Habrías creído cerrarlos y seguirían abiertos.

Comprobar tras levantar:

```bash
# Solo deben aparecer 3000, 3001 y 3003, todos en 127.0.0.1.
ss -tlnp | grep -E '3000|3001|3003|5432|6379|5000'
```

Desde fuera del VPS, esto debe dar timeout:

```bash
nc -zv <ip-del-vps> 5432
```

Para entrar a la base se usa el propio Compose, no un puerto abierto:

```bash
docker compose -f docker-compose.prod.yml exec db psql -U ruteo -d ruteo
```

## 4. Reverse proxy

El backend hace `app.set('trust proxy', 1)`: cuenta **un** salto de confianza.
Si pones un CDN por delante del proxy hay que subir ese número en `main.ts`, o
`request.ip` volverá a ser falsificable y con ella el límite por IP de login,
recuperación de contraseña y rastreo público.

Ese número importa más que antes: los cupos de las rutas sin sesión ya no fallan
abiertos cuando Redis no responde —siguen contando en memoria del proceso, ver
`common/ventana-memoria.ts`—, así que la IP es lo único que los identifica. Con
el número mal puesto, el respaldo cuenta ventanas de un atacante que cambia de
IP en cada petición y no frena nada.

Y como ese respaldo es **por proceso**, si algún día corren varias instancias
detrás del proxy, el techo real se multiplica por el número de instancias
mientras Redis esté caído. Es la degradación aceptada; con Redis vivo el cupo
sigue siendo global.

El proxy debe fijar `X-Forwarded-For` él mismo (no reenviar el del cliente):

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Host $host;
```

## 5. Variables que cambian respecto a local

```bash
NODE_ENV=production          # activa las comprobaciones de secretos
CORS_ORIGIN=https://panel.tu-dominio        # NO dejar localhost
PANEL_URL=https://panel.tu-dominio          # enlaces de los correos
PUBLIC_APP_URL=https://api.tu-dominio       # QR de las etiquetas
WEBHOOKS_PERMITIR_DESTINOS_PRIVADOS=false   # o sin definir
RESEND_API_KEY=...                          # sin esto los códigos salen por el log
```

## 6. Qué cambia para los usuarios al desplegar

- **Todas las sesiones se cierran.** La huella del refresh token pasó de bcrypt
  a SHA-256 (ver `auth.service.ts`), y los hashes antiguos ya no validan. Es
  esperado: había que cambiarlo porque bcrypt truncaba el token a 72 bytes y la
  rotación no invalidaba nada. Cada usuario vuelve a entrar una vez.
- **Swagger deja de servirse** en `/docs` con `NODE_ENV=production`.
- **Los webhooks a http:// o a direcciones internas dejan de entregarse** y se
  marcan `FAILED`. Si algún tenant tenía uno así, avísale antes.
- **`POST /api/notifications` solo acepta destinatarios de la propia empresa.**
  El correo tiene que estar en el equipo o en la lista de clientes; el teléfono,
  en clientes, repartidores o envíos. Antes admitía cualquiera, que convertía el
  dominio en un relay de correo abierto. El canal `PUSH` se rechaza mientras no
  haya registro de dispositivos contra el que validar (hoy solo escribía al log,
  así que no se pierde ninguna entrega real).
- **Los avisos automáticos no cambian**: su destinatario sale del envío, no de
  una petición, y no pasa por ese filtro.
- **Las lecturas pasan a exigir rol.** `RolesGuard` deniega por defecto: un
  endpoint sin `@Roles` ni `@CualquierRol` responde 403 y lo registra como error
  del servidor, no del usuario. Antes dejaba pasar, y como casi ninguna lectura
  declaraba roles, cualquier cuenta —incluidas `CUSTOMER` y `SUPPORT`, que no
  aparecían en ningún `@Roles`— leía la agenda de clientes, los casilleros, la
  caja y el tarifario. Si algún cliente tenía usuarios con esos roles, avísale:
  dejan de ver casi todo el panel.
- **Cada rol entra por una pantalla distinta.** El login mandaba a todos a
  `/dashboard`, que es solo de oficina. Ahora repartidores van a rutas,
  comercios y soporte a envíos, y los clientes al rastreo público.
- **Ya no se puede subir de plan desde el panel** mientras el proveedor de cobro
  sea `manual`. Antes `POST /billing/subscribe` ponía a la empresa en
  ENTERPRISE al instante y gratis, con los catorce módulos y sin tope de
  envíos. Bajar de plan y renovar siguen funcionando; las subidas se activan
  desde el panel de plataforma.
- **Las claves de idempotencia caducan a las 24 h** y se purgan cada hora. La
  migración marca las existentes como vencidas, así que la primera purga
  después de desplegar puede borrar bastantes filas de golpe.

## 7. Respaldos

`ruteo_pgdata` es el **único** volumen irrecuperable: el de OSRM se regenera con
`scripts/osrm-prepare.sh` y Redis es caché y colas. Si se pierde ese, se perdió
el negocio.

```bash
# En el crontab del VPS:
0 3 * * *  cd /srv/ruteo && ./scripts/respaldo-db.sh >> /var/log/ruteo-respaldo.log 2>&1
```

Guarda en `/var/backups/ruteo` (configurable con `RUTEO_BACKUP_DIR`), rota a los
30 días y comprueba que cada volcado sea legible antes de dar el respaldo por
bueno.

**Un respaldo sin restauración probada no es un respaldo.** La prueba es barata
y no toca producción —restaura en una base temporal al lado, cuenta filas y la
borra—, así que conviene hacerla el día que se monta y repetirla de vez en
cuando:

```bash
./scripts/restaurar-db.sh --probar /var/backups/ruteo/ruteo-<fecha>.dump
```

Y el día del desastre, `--en-serio` sobre la base real. Pide confirmación
escrita y para las aplicaciones mientras restaura.

**Falta un paso que el script no puede dar solo**: los respaldos quedan en el
mismo disco que la base. Un fallo del disco, un `rm -rf` desafortunado o que el
proveedor pierda la máquina se los lleva con ella. Copiarlos fuera —`rclone` a
un bucket, `scp` a otra máquina, lo que sea— es lo que convierte esto en un
respaldo de verdad.

## 8. Integración continua

`.github/workflows/ci.yml` corre en cada push y PR: tipos, pruebas unitarias y
compilación del backend; tipos y compilación del panel y la landing; construcción
de las tres imágenes; y validación de `docker-compose.prod.yml`.

Dos cosas a saber:

- **Los e2e solo corren si existe el secreto `ZITADEL_SERVICE_TOKEN`** (más
  `ZITADEL_ISSUER` y `ZITADEL_PROJECT_ID`). Dan de alta usuarios en ZITADEL de
  verdad, así que sin credenciales se saltan con un aviso en vez de fallar: un
  rojo permanente enseña a ignorar el CI.
- **El lint NO está en el CI, a propósito.** El repo arrastra unos 46 errores de
  `eslint` previos —casi todos de formato y `no-unsafe-*` en archivos que nadie
  ha tocado— así que añadirlo lo dejaría en rojo desde el primer día. Verlos:
  `cd backend && npx eslint "src/**/*.ts"`. Cuando se limpien, añadir el paso.

## Pendiente (no cubierto todavía)

- `helmet` en el backend y cabeceras de seguridad en Next (CSP, HSTS).
- Panel de plataforma en subdominio propio: hoy comparte origen con el panel de
  tenant, así que una XSS en cualquier pantalla alcanza la sesión de superadmin.
- Copia de los respaldos fuera del VPS (ver arriba).
- Los ~46 errores de lint previos, que mantienen el paso fuera del CI.
