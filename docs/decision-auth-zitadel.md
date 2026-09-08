# Decisión: mover la autenticación a ZITADEL

**Estado:** **implementada y verificada contra la instancia real** el 2026-08-08. Puntos 1, 2 y 3
cerrados. No queda ruta de contraseñas local.

**Flujo elegido: Session API v2**, conservando las pantallas de acceso propias. ZITADEL guarda
las credenciales y aplica sus políticas (bloqueo por reintentos, complejidad, MFA); **Ruteo sigue
emitiendo su token de sesión** con `tid`. Así el RLS no cambia de manos y los 34 ficheros que leen
`AuthUser` no se tocan.

**Fecha:** 2026-08-08 · **Instancia:** <https://auth.brandsofts.com> (verificada viva)

---

## Qué hay hoy

Autenticación propia con NestJS + Passport + JWT. Cinco endpoints en `modules/auth`:
`register`, `login`, `refresh`, `logout`, `me`.

- Contraseñas con `bcrypt` a coste 12 (`auth.service.ts`).
- Dos secretos simétricos: `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`, con sus TTL.
- El *refresh token* se guarda hasheado en `User.refreshTokenHash`; `logout` lo pone a `null`.
- El token lleva tres claims: `sub` (usuario), `tid` (tenant), `role`.
- El login exige el **`slug` del tenant en el cuerpo**, porque el correo solo es único por tenant
  (`@@unique([tenantId, email])`).

**El punto que gobierna todo el diseño** está en `prisma/prisma.service.ts:37`:

```sql
SELECT set_config('app.current_tenant_id', ${tenantId}, true)
```

El aislamiento multi-tenant por Row-Level Security cuelga entero del `tid` del token. PostgreSQL
no valida sesiones: confía en ese valor. **Quien emite el token decide qué datos ve cada quien.**

## Por qué cambiar, y por qué ahora

**El momento es el argumento principal: la base está vacía.** Cero tenants, cero usuarios
(borrados el 2026-08-07). Migrar autenticación con usuarios reales dentro obliga a mover hashes
que no se pueden rehashear, forzar restablecimientos masivos y convivir con dos sistemas de sesión.
Ahora es escribir el código nuevo y borrar el viejo. **Cero datos que mover.**

El coste de esta migración sube cada semana. Si no se hace ahora, que sea una decisión tomada, no
una inercia.

**Lo que se gana.** El discovery de la instancia confirma un OIDC completo:

| | |
|---|---|
| Grants | `authorization_code`, `implicit`, `refresh_token`, `client_credentials`, `jwt-bearer`, `device_code` |
| PKCE | `S256` |
| Firma de ID token | EdDSA, RS256/384/512, ES256/384/512 |
| Otros | backchannel logout, 22 locales de UI |

De ahí sale sin construirlo: MFA, verificación de correo y teléfono, restablecimiento de
contraseña, gestión de sesiones, protección contra fuerza bruta, registro de eventos de
autenticación, login social y SSO. Son meses de trabajo y es el área donde un fallo propio sale
más caro.

**Sinergia con la API.** `ApiKey` no tiene scopes: una llave da acceso completo a los envíos del
tenant (`JwtOrApiKeyGuard`, aplicado solo en `shipments`). `client_credentials` con scopes lo
resuelve con un estándar que cualquier comercio ya sabe integrar. **No hacerlo en el mismo paso**,
pero es la salida natural de ese hueco. Es el hueco que dejan las plataformas del sector.

## `password` grant NO está disponible

El discovery **no lista `password`**. No se puede reenviar usuario y contraseña desde el backend
de Ruteo a ZITADEL. Es correcto —ROPC está desaconsejado en OAuth 2.1 y anula el MFA— pero tiene
una consecuencia de producto: **la pantalla de login actual no puede seguir funcionando igual.**
Las opciones están en *Abierto*.

## Diseño

### Mapeo

| Ruteo | ZITADEL |
|---|---|
| `Tenant` | por ahora **no** hay org por tenant: el ámbito va en el nombre de usuario, `{slug}:{correo}` (ver hallazgo 1) |
| `tid` del token | lo pone Ruteo desde su propia fila de `User`, no ZITADEL |
| `Role` (7 valores) | *project roles* creados en el proyecto Ruteo, **todavía no leídos** (ver *Abierto*) |
| `User.passwordHash` | **eliminada**; las credenciales viven en ZITADEL |
| `User.externalId` | **nueva**; id del usuario en ZITADEL |
| `User.refreshTokenHash` | **se queda**: el token de sesión lo emite Ruteo, ese hash es suyo |

`AuthUser` **mantiene su forma** (`{ userId, tenantId, role }`). Es lo que hace la migración
abarcable: 34 ficheros dependen del usuario autenticado y ninguno cambia. Toda la adaptación vive
en la estrategia de Passport — cambia de dónde salen las claims, no quién las consume.

### Regla innegociable

**El `tid` nunca se deduce ni se rellena por defecto.** Sale de la fila local de `User`, resuelta
por el slug del tenant, y si no hay fila el login se rechaza. Un fallo abierto aquí es fuga de
datos entre empresas, que es exactamente lo que el RLS existe para impedir.

### Riesgos y mitigación

1. **El registro ya no es atómico.** Pasa a: crear usuario en ZITADEL → crear tenant y usuario
   locales. **Resuelto con compensación**: si lo local falla, se borra el usuario remoto. Sin eso
   quedaría una cuenta huérfana que, por ser el nombre único en toda la instancia, impediría
   reintentar el registro con el mismo slug y correo.
2. **Dependencia nueva en caliente.** Si `auth.brandsofts.com` cae, nadie entra ni cambia su
   contraseña. **Sin mitigar todavía.** Antes dependía solo de la propia base.

### Frontera: quién entra en ZITADEL y quién no

**Sí — usuarios del panel:** `OWNER`, `ADMIN`, `OPERATOR`, `SUPPORT`, `MERCHANT`, `DRIVER`. Son
pocos, de alto valor, y son los que necesitan MFA, SSO y recuperación de contraseña.

**No — el destinatario del casillero (`CUSTOMER`):** son miles, de bajo valor por identidad, y lo
que necesitan es un enlace mágico sin contraseña para el área de cliente. Meterlos en el proveedor
de identidad infla el padrón sin dar nada a cambio, y si algún día se pasa de autoalojado a la nube
gestionada, esa población es la que haría el coste insoportable.

## Impacto en las pruebas

| Suite | Pruebas | Efecto |
|---|---|---|
| `test/rls-isolation.e2e-spec.ts` | 35 | Sin cambios de fondo: siembra por Prisma y prueba el RLS en la base, no el login. Solo se quitó el `passwordHash` del sembrado. |
| `test/api-tenant-isolation.e2e-spec.ts` | 18 | **Corre contra la instancia real** y sigue en verde. Es el arnés que valida que el aislamiento aguanta el cambio de proveedor. |

Ambas purgan en ZITADEL los usuarios que crean (`purgarUsuariosZitadel` en `tenant-fixtures.ts`).
Sin esa limpieza, el nombre único a nivel de instancia acabaría haciendo fallar corridas futuras
con 409.

## Orden de trabajo

1. Migrar el login del panel. Mantener la forma de `AuthUser`.
2. Verificar el aislamiento con `api-tenant-isolation` adaptada.
3. Borrar el código de contraseñas propio. **No dejarlo "por si acaso"** — dos caminos de
   autenticación conviviendo es cómo aparecen los agujeros. (El alcance real resultó más ancho
   de lo previsto; ver más abajo.)
4. Más adelante y por separado: `client_credentials` con scopes para reemplazar `ApiKey`.

## Contrato de la Session API usado

| Paso | Llamada |
|---|---|
| 1. Sesión con el usuario | `POST /v2/sessions` · `{ checks: { user: { loginName } } }` → `sessionId`, `sessionToken` |
| 2. Comprobar contraseña | `PATCH /v2/sessions/{id}` · `{ sessionToken, checks: { password: { password } } }` |
| 3. Cerrar sesión | `DELETE /v2/sessions/{id}` · `{ sessionToken }` |
| Alta de usuario | `POST /v2/users/human` |

Todas con `Authorization: Bearer <cuenta de servicio>`.

La sesión de ZITADEL **no se conserva**: sirve para comprobar la credencial y se cierra. El token
que viaja al panel lo sigue firmando Ruteo.

## Lo implementado

- `modules/auth/zitadel/zitadel.service.ts` — cliente de la Session API.
- `modules/auth/zitadel/zitadel.service.spec.ts` — **15 pruebas unitarias**.
- `auth.service.ts` y `users.service.ts` — sin ninguna ruta de contraseña local.
- `env.validation.ts` y `.env.example` — `ZITADEL_ISSUER` y `ZITADEL_SERVICE_TOKEN` **obligatorios**
  al arrancar: sin ellos la app no puede autenticar a nadie, y es mejor que falle al arranque que
  en el primer login.

**Provisionado en la instancia:** proyecto `Ruteo` (`385332063022088195`) con los 6 roles del
panel. No existía nada; la instancia solo traía la organización y el proyecto de fábrica.

**Decisiones que quedan grabadas en las pruebas:**

- Un usuario inexistente y una contraseña mala devuelven **el mismo error y el mismo mensaje**. Si
  se distinguieran, probando correos se averigua cuáles están dados de alta.
- Un 500 o una caída de ZITADEL es `ServiceUnavailable`, **nunca** `Unauthorized`. Si no, una
  caída del proveedor se lee en los registros como una oleada de contraseñas mal puestas.
- No basta con que la llamada no falle: se exige `factors.password.verifiedAt`. Sin esa
  comprobación, un cambio futuro que devolviera 200 sin verificar dejaría pasar a cualquiera.
- En el registro, el usuario se crea **primero en ZITADEL**. Si falla, no se ha escrito nada local.
  Al revés quedarían tenants sin nadie que pueda entrar, más difícil de limpiar que una cuenta
  huérfana.
- `passwordHash` es NOT NULL y todavía no se ha migrado: en modo ZITADEL se escribe un valor que
  bcrypt no puede validar nunca. Si alguien volviera a `local` por error, esas cuentas **no entran
  con ninguna contraseña**, en vez de entrar con una débil.

## Tres hallazgos de la instancia real que cambiaron el diseño

Ninguno estaba en la documentación. Los tres se descubrieron probando contra
`auth.brandsofts.com` y los tres habrían pasado por buenos sin comprobarlos.

### 1. El nombre de usuario es único en TODA la instancia

Dar de alta el mismo `username` devuelve 409 **incluso en otra organización**: el ajuste
*"User Login must be Domain"* está desactivado. Como Ruteo permite el mismo correo en tenants
distintos, el ámbito se construye en el nombre: **`{slug}:{correo}`**.

La alternativa era activar ese ajuste, pero es de instancia y `auth.brandsofts.com` está
compartido con otros proyectos de Brandsofts: cambiarlo podría romperlos.

### 2. El `PATCH` de la contraseña no devuelve los factores

Responde 200 con solo `details` y `sessionToken`. Exigir `factors.password.verifiedAt` en esa
respuesta —que es lo razonable de suponer— dejaba **el login roto para todo el mundo**. Los
factores hay que pedirlos con un `GET /v2/sessions/{id}` posterior, que es también donde se
confirma de verdad la verificación.

Además, **una contraseña incorrecta devuelve 400, no 401**, con
`details[].@type = CredentialsCheckError`. Sin mirar el cuerpo, un login fallido normal salía
como 503 "proveedor caído".

### 3. Con token de administrador, ZITADEL IGNORA `verification.currentPassword`

El más serio. Llamando a `POST /v2/users/{id}/password` con el token de la cuenta de servicio,
ZITADEL **acepta el cambio aunque la contraseña actual sea incorrecta**: devuelve 200 y la
contraseña cambia de verdad (comprobado autenticando después con la nueva).

Delegar ahí la comprobación del cambio de contraseña propio habría dejado que **cualquiera con
una sesión abierta cambiara la contraseña sin conocer la anterior**, con el control aparentando
funcionar.

Por eso `changePassword` verifica la actual **con la Session API** —que sí la aplica— antes de
fijar la nueva. El restablecimiento por administrador (`resetPassword`) no la pide a propósito:
ahí el control es de permisos, no de credencial.

## Alcance final del punto 3

Resultó más ancho de lo previsto. `users.service.ts` tenía tres operaciones de contraseña además
del login, y dejarlas sin migrar era peor que un error: **cambiar la contraseña habría dicho
"listo" sin cambiar nada**, porque escribía en una columna que ya nadie lee.

| Operación | Antes | Ahora |
|---|---|---|
| `auth.register` | bcrypt local | crea el usuario en ZITADEL, guarda `externalId`, compensa borrando si el alta local falla |
| `auth.login` | `bcrypt.compare` | Session API |
| `users.create` | bcrypt local | igual que el registro |
| `users.changePassword` | `bcrypt.compare` | verifica la actual por Session API + fija la nueva |
| `users.resetPassword` | bcrypt local | fija la nueva como admin y corta el refresh vigente |

**Lo que NO se borró, contra lo que decía el plan original:** `refreshTokenHash`, los dos
secretos JWT y `JwtRefreshStrategy`. El plan los daba por eliminables asumiendo que ZITADEL
emitiría los tokens; con Session API los emite Ruteo, así que ese hash es suyo y no una
credencial de usuario. `bcrypt` sigue en el proyecto solo para eso.

Migración: `20260808070000_credenciales_en_zitadel` — quita `users.password_hash`, añade
`users.external_id` único.

## Verificación

| Qué | Resultado |
|---|---|
| Unitarias | 64 en verde (15 del cliente ZITADEL) |
| e2e | 62 en verde, incluidas las 18 de aislamiento multi-tenant **contra la instancia real** |
| Humo de punta a punta | 7/7: alta, login, clave incorrecta, mismo correo en dos tenants, `tid` distintos |
| Cambio de contraseña | actual incorrecta → 401 y la clave **no** cambia; actual correcta → cambia y la vieja deja de valer |

Las suites limpian tras de sí los usuarios que crean en ZITADEL (`purgarUsuariosZitadel`), o el
nombre único a nivel de instancia acabaría haciendo fallar registros futuros con 409.

## Verificación de correo y restablecimiento (2026-08-08)

### El hallazgo que definió el diseño

Igual que con `currentPassword`, pero peor: **ZITADEL tampoco valida
`verification.verificationCode`** cuando se le llama con el token de la cuenta de servicio.
Comprobado fijando la contraseña de un usuario con un código **inventado**, sin haber pedido
restablecimiento: devuelve 200 y la contraseña cambia de verdad.

Construir el restablecimiento reenviando a ZITADEL el código que teclea el usuario —lo natural—
habría dejado que **cualquiera restableciera la contraseña de cualquiera**.

### Diseño: el código lo custodia Ruteo

Tabla `credential_tokens` (con política RLS: es tenant-scoped, y sin ella un tenant podría gastar
los códigos de otro).

| Control | Cómo |
|---|---|
| Código | 6 dígitos con `crypto.randomInt`, no `Math.random` |
| Almacenamiento | solo el hash bcrypt |
| Vigencia | 30 minutos |
| Uso | único: al validarse se borra la fila |
| Renovación | pedir uno nuevo invalida el anterior |
| Fuerza bruta | 5 intentos y el código se quema (columna `attempts`) |
| Enumeración | `forgot-password` responde 202 exista o no la cuenta; el error de reset es idéntico |
| Fuga por el panel | el cuerpo del aviso se guarda como `[código omitido]`: `/notifications` lo lee cualquier operador |
| Robo de cuenta | restablecer borra `refreshTokenHash`, cortando las sesiones vivas |

A ZITADEL solo se le pide **fijar** la contraseña, ya comprobado el código.

### Envío

`ResendNotificationProvider` por la API HTTP de Resend (sin dependencias nuevas). Sin
`RESEND_API_KEY` cae al proveedor de log, lo que permite probar el flujo entero sin mandar correo.
Si la configuración está incompleta, la notificación se marca **FAILED y no SENT**: un correo que
nadie recibe pero figura como entregado es peor que un error visible, más cuando lleva un código.

### Endpoints y pantallas

| Endpoint | Pantalla |
|---|---|
| `POST /auth/forgot-password` (público, siempre 202) | `/forgot-password` |
| `POST /auth/reset-password` (público) | `/reset-password` |
| `POST /auth/send-verification` (con sesión) | banda en el panel |
| `POST /auth/verify-email` (con sesión) | banda en el panel |

La verificación es una **banda, no un bloqueo**: cortarle el paso a quien acaba de registrarse por
un correo que quizá tarde es la forma más rápida de perderlo antes de que pruebe el producto.

`marcarCorreoVerificado` usa la API **v1**: la v2 rechaza con "Email not changed" cuando el correo
es idéntico, que es justo el caso aquí.

## Abierto

**1. Rotar el token de la cuenta de servicio.** Se pegó en texto plano en una conversación el
2026-08-08. Está en `backend/.env` (ignorado por git y sin rastrear, comprobado).

**2. Mapeo de roles.** Hoy el rol lo manda la fila local de `User`, no ZITADEL. Funciona, pero
significa que ZITADEL solo autentica y no autoriza. Si se quiere que los roles vivan allí, hay que
leer la claim de *project roles* — y decidir qué manda si las dos fuentes discrepan.

**3. Organización por tenant.** Hoy todos los usuarios viven en la organización por defecto y el
ámbito lo da el nombre (`{slug}:{correo}`). Funciona porque la fila local de `User` es la
autoridad sobre tenant y rol. Si ZITADEL pasa a mandar en la autorización, habrá que crear una
org por tenant y guardar su id.

**4. Sin flujo de "cambio de contraseña obligatorio".** El panel no sabe manejar
`changeRequired: true`, así que las cuentas provisionadas a mano se crean sin él. Si se quiere
forzar el cambio en el primer acceso, hay que construir esa pantalla primero.

**5. Verificación de correo y MFA no están cableados.** ZITADEL los ofrece, pero con login propio
hay que integrarlos pantalla a pantalla — es el coste que se aceptó al conservar las pantallas.
