# Despliegue en VPS

Lo que el código **no** puede hacer por sí solo. El arranque en producción
comprueba buena parte de esto y se niega a levantar si falta (ver
`backend/src/config/env.validation.ts`), pero los pasos de aquí hay que darlos.

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

`docker-compose.yml` publica Postgres, Redis y OSRM **solo en 127.0.0.1**. No lo
cambies: las reglas que Docker escribe en iptables se evalúan antes que las de
UFW, así que un puerto publicado en `0.0.0.0` queda abierto a internet aunque el
firewall diga lo contrario. Comprobar tras levantar:

```bash
ss -tlnp | grep -E '5544|6379|5100'   # todo debe decir 127.0.0.1, nunca 0.0.0.0
```

Desde fuera del VPS, esto debe dar timeout:

```bash
nc -zv <ip-del-vps> 6379
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

## Pendiente (no cubierto todavía)

- `helmet` en el backend y cabeceras de seguridad en Next (CSP, HSTS).
- Panel de plataforma en subdominio propio: hoy comparte origen con el panel de
  tenant, así que una XSS en cualquier pantalla alcanza la sesión de superadmin.
- Dockerfile de `frontend` y `landing`, compose de producción y CI.
- El contenedor del backend corre como root (falta `USER node` en el Dockerfile).
- Backups de Postgres.
