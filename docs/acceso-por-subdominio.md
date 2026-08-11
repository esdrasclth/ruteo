# Acceso por subdominio

Cada empresa entra por `<slug>.ruteo.brandsofts.com`. El slug dejó de ser un
campo del formulario de login y pasó a ser parte del hostname.

## Qué cambia para quien entra

Antes: ibas a `panel.ruteo.brandsofts.com`, escribías `enviospress` en un campo
llamado «Empresa», tu correo y tu contraseña.

Ahora hay dos puertas, y las dos funcionan:

- **Por la dirección de la empresa** (`enviospress.ruteo.brandsofts.com`): solo
  correo y contraseña. El slug sale del hostname.
- **Por el panel raíz** (`panel.ruteo.brandsofts.com`): correo y contraseña, y
  el sistema averigua a qué empresa perteneces. Es la puerta para quien no se
  acuerda de su subdominio, que es casi todo el mundo la primera vez.

El alta (`/register`) sigue viviendo en el panel raíz, que es la única pantalla
que de verdad no tiene empresa todavía.

### El slug es opcional en el cuerpo, no en el modelo

`POST /auth/login` acepta `slug` o no:

- **Con slug**: camino de siempre, devuelve los tokens.
- **Sin slug**: se resuelve en qué empresas existe ese correo
  (`tenants_by_user_email`, SECURITY DEFINER, igual que `tenant_id_by_slug`) y
  se comprueba la contraseña **contra cada una** —en ZITADEL son usuarios
  distintos, `slug:correo`, y pueden tener contraseñas distintas—. Se responde
  con la lista de empresas donde la credencial es buena.

Que falte el slug no relaja ninguna comprobación: se hacen las mismas, N veces.
Con la contraseña mal, la respuesta es el mismo 401 genérico exista el correo o
no. Como tope hay cinco empresas por intento (`MAX_CANDIDATAS`), para que un
correo dado de alta en muchas no convierta cada login en una ráfaga de
peticiones a ZITADEL.

El freno por cuenta usa **un solo cubo** para el login sin slug (`CUBO_SIN_SLUG`,
un slug imposible). Repartirlo por empresa daría cinco veces los intentos antes
del bloqueo, que es justo lo contrario de lo que hace falta cuando una sola
petición prueba contra cinco empresas.

### Por qué no devuelve tokens: el vale de traspaso

El panel raíz comprueba la contraseña pero **no puede dejar la sesión escrita**:
`panel.…` y `enviospress.…` son orígenes distintos y no comparten
`localStorage`. Ese aislamiento es la razón de ser de todo esto, así que la
salida no es meterle el JWT en la URL al subdominio —quedaría en el historial,
en el `Referer` y en los registros de cualquier proxy, y seguiría sirviendo
horas—.

Lo que viaja es un **vale de un solo uso** (`SessionHandoffService`): 256 bits
aleatorios, guardados solo como hash, válidos **60 segundos** y quemados al
primer canje. La empresa recibe `…/auth/handoff?code=…`, esa pantalla lo canjea
por los tokens de verdad (`POST /auth/handoff`) y la sesión nace ya en el origen
correcto. El vale no lleva rol ni permisos dentro: el rol se relee de la base de
datos al canjearlo, porque en esos sesenta segundos a alguien le pueden haber
quitado el acceso.

Si el correo existe en **varias** empresas con la misma contraseña, se emite un
vale por cada una y el panel raíz pregunta a cuál entrar. Esa lista solo aparece
con la contraseña ya comprobada, así que no delata dónde tiene cuenta nadie.

El vale se guarda en Redis **y** en memoria del proceso, y el canje lo quema en
los dos sitios. Lo primero porque `RedisService` falla abierto por diseño y una
caída dejaría a todo el mundo sin poder entrar desde la raíz, sin ningún error
que lo explicara; lo segundo porque borrarlo solo de donde se leyó convertiría
el «un solo uso» en dos.

### `panel` no es una empresa

`slugDelHost` recorta el dominio base del hostname, y en `panel.ruteo.brandsofts.com`
eso deja `panel`, que encaja con el juego de caracteres de un slug. Sin filtro,
el panel raíz se creía la empresa «panel» y mandaba `slug: "panel"` al login: el
backend no encuentra esa empresa y responde «credenciales inválidas» **a gente
que teclea su contraseña correcta**. Por eso `frontend/src/lib/slugs-reservados.ts`
es copia de `SLUGS_RESERVADOS` del backend, y por eso hay que tocar las dos al
añadir un host bajo el dominio.

### Recuperar la contraseña desde la raíz

`POST /auth/forgot-password` acepta el slug o no, igual que el login. Sin slug se
manda un código por **cada** empresa donde exista el correo, y cada mensaje dice
de qué empresa es y trae el enlace a su panel —quien recibe dos códigos a la vez
no tiene forma de saber cuál va con cuál—. Los correos llegan al buzón del
titular, no a quien pulsó el botón, y la respuesta sigue siendo 202 en todos los
casos.

## Lo que NO es esto

**El subdominio no autentica nada.** El slug sigue viajando en el cuerpo de la
petición y cualquiera puede mandar otro con `curl` —o no mandar ninguno—. Lo que
decide de verdad a qué empresa se entra es lo de siempre: la contraseña
comprobada contra ZITADEL, el `tid` del JWT y el RLS de Postgres. El subdominio
solo evita que el usuario tenga que teclear el identificador.

Lo que sí gana en seguridad es el **aislamiento de origen**: hasta ahora todos
los tenants compartían `panel.ruteo.brandsofts.com`, así que una XSS en la
pantalla de una empresa alcanzaba la sesión de cualquier otra. Con un origen por
empresa, el navegador las separa.

## El riesgo que aparece, y cómo se cierra

En cuanto el slug es un subdominio, registrarse con el slug `api` significa
quedarse con `api.ruteo.brandsofts.com`, que es el backend. Con `panel`, el
panel raíz. Con `postmaster`, un buzón que las autoridades certificadoras usan
para validar dominios.

Por eso `backend/src/common/tenant-host.ts` tiene `SLUGS_RESERVADOS`, que el
alta comprueba (`RegisterDto`). **Ampliar esa lista antes de añadir cualquier
host nuevo bajo `ruteo.brandsofts.com`**: si mañana montas
`metrics.ruteo.brandsofts.com` y `metrics` no está en la lista, alguien puede
haberlo registrado ya.

El registro además exige forma de etiqueta DNS válida: sin guión al principio ni
al final, y sin dos guiones seguidos (`xn--` es el prefijo de los dominios
internacionalizados).

## Configuración

| Variable | Dónde | Ejemplo |
| --- | --- | --- |
| `PUBLIC_PANEL_BASE_HOST` | build del panel | `ruteo.brandsofts.com` |
| `PUBLIC_PANEL_TENANT_URL` | entorno del backend | `https://{slug}.ruteo.brandsofts.com` |
| `PUBLIC_PANEL_URL` | ambos | `https://panel.ruteo.brandsofts.com` |

`PUBLIC_PANEL_BASE_HOST` se **incrusta en el bundle** al construir: cambiarlo
obliga a reconstruir la imagen del panel. Si no coincide con el host real,
`slugDelHost` devuelve `null` en todas partes y el panel de cada empresa se
comporta como el raíz: en vez de entrar directo, descubre la empresa por el
correo y da un rebote de más por el vale de traspaso. Funciona, pero mal, y el
síntoma no señala a la variable.

`PANEL_TENANT_URL` alimenta dos cosas a la vez: los enlaces de los correos de
verificación e invitación, y la lista de orígenes que acepta el CORS. El
arranque en producción aborta si le falta el `{slug}` o si no es `https://`.

## Infraestructura: DNS y certificado

**Hecho y en pie.** Se eligió el comodín con DNS-01, así que una empresa nueva
funciona en cuanto se registra, sin tocar el servidor.

### 1. DNS comodín

```
*.ruteo.brandsofts.com   A   185.190.143.19   (solo DNS, nube gris)
```

### 2. Certificado comodín

Let's Encrypt **no emite comodines por HTTP-01**, que es el único desafío que
Dokploy configura. Y hacerlo con el ACME de Traefik obligaría a meterle
`CF_DNS_API_TOKEN` al contenedor `dokploy-traefik`, que Dokploy recrea en cada
actualización: la variable desaparece y la renovación deja de funcionar sin que
se entere nadie hasta que el certificado caduca.

Por eso el certificado lo pide `scripts/cert-comodin.sh` (lego contra Cloudflare
por DNS-01) y Traefik solo lo lee como archivo. La renovación es un cron semanal
que instala `scripts/instalar-crons.sh` —que copia los scripts a
`/usr/local/sbin` para que un despliegue no se los lleve por delante—.

El token de Cloudflare debe ser **acotado** (`Zone:DNS:Edit` sobre la zona), no
una Global API Key.

### 3. Enrutado

`deploy/traefik/ruteo-comodin.yml`, que se copia a
`/etc/dokploy/traefik/dynamic/`. Ese archivo lleva sus propias advertencias
dentro y conviene leerlas antes de tocarlo: la `priority: 1` que impide que la
regex se trague el panel raíz y la API, y que Traefik pasa el YAML por su motor
de plantillas Go **incluidos los comentarios**, así que unas llaves dobles en un
comentario tumban el archivo entero en silencio.

## Pendiente

- **Empresas suspendidas.** El login sin slug no filtra por `Tenant.status`, a
  propósito: entrar por el subdominio de una empresa suspendida hoy funciona, y
  filtrar solo aquí daría dos reglas distintas para la misma cuenta según por
  dónde entre. Falta decidir cuál de las dos es la buena y aplicarla en los dos
  sitios.
- **Varias instancias del backend.** El vale de traspaso vive en Redis y, como
  respaldo, en la memoria del proceso. Con Redis en pie da igual qué instancia
  atienda el canje; sin Redis, el canje tiene que caer en la misma que emitió el
  vale. Si algún día hay más de una instancia, hay que decidir si ese respaldo
  sigue teniendo sentido.
- El panel de plataforma (superadmin) sigue compartiendo origen con el panel de
  tenant. El acceso por subdominio no lo arregla: sigue pendiente moverlo a un
  host propio (ver `docs/despliegue-vps.md`).
