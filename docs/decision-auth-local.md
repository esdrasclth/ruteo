# Decisión: las contraseñas vuelven a Postgres (fuera ZITADEL)

**Estado:** implementada el 2026-10-01. Sustituye a
[`decision-auth-zitadel.md`](decision-auth-zitadel.md), que queda como historia.

## Por qué

ZITADEL solo hacía una cosa en Ruteo: decir si una contraseña cuadraba. Todo lo
demás ya era nuestro:

- el token de sesión (con `tid`, del que cuelga el RLS) lo emitía Ruteo;
- el rol y el tenant salían de la fila local de `users`;
- los códigos de restablecimiento, invitación y verificación los custodiaba Ruteo,
  porque con token de cuenta de servicio ZITADEL no los validaba;
- el bloqueo por intentos lo hacía Ruteo (`LoginThrottleService`), porque la
  política de la instancia estaba desactivada;
- MFA, SSO y login social nunca se llegaron a cablear.

A cambio costaba un servicio más que mantener en el VPS, una caída que dejaba a
todo el mundo fuera, un nombre de usuario artificial (`{slug}:{correo}`), altas
no atómicas con compensación y usuarios huérfanos al borrar empresas.

## Qué hay ahora

| | |
|---|---|
| Almacenamiento | `users.password_hash` y `platform_admins.password_hash`, bcrypt coste 12 |
| Código | `backend/src/modules/auth/contrasenas.ts` |
| Política de contraseña nueva | la misma que tenía ZITADEL: 8+ caracteres con mayúscula, minúscula, número y símbolo; máximo 72 **bytes** (límite de bcrypt) |
| Sin hash | la cuenta no entra con ninguna contraseña (falla cerrada) |
| Enumeración | sin cuenta se compara contra un hash de relleno: tarda lo mismo |

Las operaciones de credencial son las mismas y con las mismas reglas: registro,
login (con y sin slug), invitación, restablecimiento por código, restablecimiento
por un administrador (corta el refresh) y cambio de la propia contraseña
(comprueba la actual).

Se eliminaron `ZITADEL_ISSUER`, `ZITADEL_SERVICE_TOKEN` y `ZITADEL_PROJECT_ID`.
Los e2e ya no necesitan secretos y corren siempre en el CI.

## Cuentas existentes: hay que restablecerlas

Los hashes no salen de ZITADEL, así que la migración
`20261001000000_credenciales_locales` deja todas las cuentas anteriores **sin
contraseña**. Para recuperar el acceso:

- **Usuario con el correo verificado:** «¿Olvidaste tu contraseña?» en el login.
- **Usuario con el correo sin verificar:** un OWNER o ADMIN de su empresa le
  restablece la contraseña desde Equipo (el restablecimiento por código se niega
  con correos sin verificar, a propósito).
- **OWNER sin verificar y sin nadie que lo restablezca:** desde el servidor:

  ```bash
  docker compose -p ruteo-stack-shc0uh -f /etc/dokploy/compose/ruteo-stack-shc0uh/code/docker-compose.dokploy.yml \
    run --rm backend node dist/scripts/restablecer-contrasena.js <slug> correo@dominio 'Contraseña-nueva-1'
  ```
- **Superadmin:** se vuelve a correr el script, que ahora también sirve para
  cambiar la contraseña de uno que ya existe:

  ```bash
  docker compose -p ruteo-stack-shc0uh -f /etc/dokploy/compose/ruteo-stack-shc0uh/code/docker-compose.dokploy.yml \
    run --rm backend node dist/scripts/crear-superadmin.js correo@dominio 'Contraseña-nueva-1' "Nombre"
  ```

En local, lo mismo con `npx ts-node scripts/<script>.ts` desde `backend/`.
