# Acceso por subdominio

Cada empresa entra por `<slug>.ruteo.brandsofts.com`. El slug dejó de ser un
campo del formulario de login y pasó a ser parte del hostname.

## Qué cambia para quien entra

Antes: ibas a `panel.ruteo.brandsofts.com`, escribías `enviospress` en un campo
llamado «Empresa», tu correo y tu contraseña.

Ahora: vas a `enviospress.ruteo.brandsofts.com` y solo pones correo y
contraseña. El panel raíz (`panel.…`) ya **no** deja iniciar sesión: muestra una
pantalla que explica que hay que entrar por la dirección de la empresa. Lo único
que sigue viviendo ahí es el alta (`/register`), que es la única pantalla que
todavía no tiene empresa.

## Lo que NO es esto

**El subdominio no autentica nada.** El slug sigue viajando en el cuerpo de la
petición y cualquiera puede mandar otro con `curl`. Lo que decide de verdad a
qué empresa se entra es lo de siempre: `resolveIdBySlug` en el backend, el `tid`
del JWT y el RLS de Postgres. El subdominio solo evita que el usuario tenga que
teclear el identificador.

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
`slugDelHost` devuelve `null` y todo el mundo ve «entra por la dirección de tu
empresa», incluso entrando por la dirección correcta.

`PANEL_TENANT_URL` alimenta dos cosas a la vez: los enlaces de los correos de
verificación e invitación, y la lista de orígenes que acepta el CORS. El
arranque en producción aborta si le falta el `{slug}` o si no es `https://`.

## Infraestructura: DNS y certificado

Esta es la parte que no está hecha y que hay que decidir.

### 1. DNS comodín (obligatorio en ambos casos)

```
*.ruteo.brandsofts.com   A   185.190.143.19   (solo DNS, nube gris)
```

### 2. El certificado: dos caminos

Let's Encrypt **no emite comodines por HTTP-01**, que es el único desafío que
Dokploy configura (`certificatesResolvers.letsencrypt.acme.httpChallenge` en
`/etc/dokploy/traefik/traefik.yml`).

#### Opción A — certificado comodín con DNS-01

Automático de verdad: una empresa nueva funciona en cuanto se registra, sin
tocar nada.

En `/etc/dokploy/traefik/traefik.yml`, **añadir** un resolver (sin borrar el que
ya hay, que es el que sostiene los dominios actuales):

```yaml
certificatesResolvers:
  letsencrypt: # el que ya existe, no tocar
    # …
  cloudflare:
    acme:
      email: esdras.clother@outlook.com
      storage: /etc/dokploy/traefik/dynamic/acme-dns.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - '1.1.1.1:53'
```

Y un router en `/etc/dokploy/traefik/dynamic/ruteo-tenants.yml`. Sintaxis de
**Traefik v3**, que es la que corre aquí —lo confirma el proveedor `swarm` de la
config—: `HostRegexp` usa expresiones regulares de Go, no la sintaxis de v2 con
`{subdominio:...}`.

```yaml
http:
  routers:
    ruteo-tenants:
      # `priority` baja a propósito: los routers de `panel.` y `api.` que crea
      # Dokploy tienen que ganar, y esta regex también los encajaría.
      priority: 1
      rule: 'HostRegexp(`^[a-z0-9-]+\.ruteo\.brandsofts\.com$`)'
      entryPoints: [websecure]
      service: ruteo-panel
      tls:
        certResolver: cloudflare
        domains:
          - main: 'ruteo.brandsofts.com'
            sans: ['*.ruteo.brandsofts.com']
  services:
    ruteo-panel:
      loadBalancer:
        servers:
          - url: 'http://ruteo-stack-shc0uh-frontend-1:3001'
```

**El punto difícil**: el desafío DNS-01 necesita que el contenedor de Traefik
tenga `CF_DNS_API_TOKEN` en su entorno, y Dokploy no expone eso en la interfaz.
Hay que añadirlo al servicio de Traefik a mano, y comprobar que sobrevive a las
actualizaciones de Dokploy —que recrea ese contenedor—.

Ese token debe ser **acotado** (`Zone:DNS:Edit` sobre `brandsofts.com`), no una
Global API Key: va a vivir en un contenedor que enruta todo el servidor.

#### Opción B — un dominio por empresa en Dokploy

Sin cirugía sobre Traefik. Al dar de alta una empresa, se añade su dominio en la
pestaña **Domains** del servicio `stack` (servicio `frontend`, puerto 3001,
HTTPS, Let's Encrypt) y Dokploy pide su certificado por HTTP-01 como con
cualquier otro.

- **A favor**: cero riesgo de romper el proxy, usa lo que ya funciona, y se
  puede automatizar más adelante con la API de Dokploy.
- **En contra**: un paso manual por cada empresa nueva. Y Let's Encrypt limita a
  **50 certificados por semana y dominio registrado**, así que no sirve si el
  alta llega a ser masiva y automática.

Para el ritmo de alta de un SaaS que arranca, B es lo sensato: se tarda un
minuto por cliente y no se juega el proxy de todo el servidor. A es la respuesta
correcta cuando el alta deba ser autoservicio.

## Pendiente

- Elegir A o B y aplicarlo. **Hasta entonces, el acceso por subdominio no
  funciona en producción aunque el código ya esté**: no hay DNS comodín ni
  certificado, así que `enviospress.ruteo.brandsofts.com` no resuelve.
- Con el panel raíz sin login, decidir si `panel.ruteo.brandsofts.com` sigue
  existiendo solo para `/register` o si el alta se mueve a la landing.
- El panel de plataforma (superadmin) sigue compartiendo origen con el panel de
  tenant. El acceso por subdominio no lo arregla: sigue pendiente moverlo a un
  host propio (ver `docs/despliegue-vps.md`).
