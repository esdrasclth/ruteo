# Contribuir a Ruteo

El código es público pero no es de uso libre: la licencia es propietaria y las
contribuciones se ceden a su titular (ver [`LICENSE`](LICENSE)). Esta guía es
para quien vaya a proponer un cambio.

Para situarte, [`docs/funcionalidades-ruteo.md`](docs/funcionalidades-ruteo.md)
recoge el catálogo funcional.

---

## Entorno

Requisitos: **Node 20** (la misma que usan las imágenes y el CI), Docker y Docker
Compose.

```bash
docker compose up -d                 # Postgres, Redis y OSRM

cd backend
npm install
cp .env.example .env                 # revisa los valores antes de seguir
npx prisma migrate deploy
npx prisma generate
npm run start:dev                    # http://localhost:3002/api · docs en /docs

cd ../frontend && npm install && npm run dev   # panel   → http://localhost:3001
cd ../landing  && npm install && npm run dev   # público → http://localhost:3003
```

Comprueba que las dependencias están vivas antes de dar por bueno el arranque:

```bash
curl http://localhost:3002/api/health/ready
# {"ready":true,"checks":{"db":"up","redis":"up","almacenamiento":"up"}}
```

`/api/health` sólo dice que el proceso responde. El que importa es `/ready`.

No hay seed: se registra una empresa desde `/register` y se cargan los datos
siguiendo [`docs/datos-de-prueba.md`](docs/datos-de-prueba.md), que sirve a la vez
de guion de pruebas del panel.

---

## Las reglas que no se negocian

Estas sostienen el diseño. Un cambio que las rompa necesita discutirse antes, no
después.

### 1. Cada tabla del negocio lleva RLS

El aislamiento entre empresas lo impone PostgreSQL, no el código. **Prisma no
genera las políticas**: cada tabla nueva las lleva escritas a mano en su
migración. Olvidarlas no rompe nada visible —la tabla funciona— pero deja los
datos de todas las empresas al alcance de cualquiera con sesión. Si añades una
tabla y no sabes cómo redactar la política, copia la de una tabla vecina y
compara.

### 2. Las claves de archivo empiezan por el identificador de empresa

El almacenamiento de objetos no tiene RLS. Por eso toda clave es
`t/{tenantId}/...` y las URLs se firman al leer, con vigencia corta. **Nunca se
guarda una URL firmada** en base de datos ni se devuelve una sin caducidad.

### 3. Las credenciales viven en ZITADEL

Ruteo emite sus propios tokens de sesión y custodia a propósito los códigos de un
solo uso. El porqué está en
[`docs/decision-auth-zitadel.md`](docs/decision-auth-zitadel.md); léelo antes de
mover nada de autenticación.

### 4. Las suites e2e purgan sólo su propio grupo

Corren en paralelo. Una purga global haría que una suite borre los datos que otra
está usando. Si escribes una suite nueva, dale su propio prefijo de empresas de
prueba y limpia sólo ése.

### 5. El esquema se cambia con migración y respaldo

Nada de `prisma db push` contra algo que no sea tu base local. Antes de desplegar
un cambio de esquema: `scripts/respaldo-db.sh`.

---

## Antes de abrir el pull request

Lo mismo que ejecuta el CI, para no descubrirlo en rojo:

```bash
cd backend
npx prisma generate
npx eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
npx tsc --noEmit -p tsconfig.json
npm test
npm run build
```

```bash
cd frontend
npm run lint
npm run build
npm run budget        # presupuesto de rendimiento
```

Si tocaste lógica de negocio del backend, corre además `npm run test:e2e`. Esa
suite da de alta usuarios en ZITADEL de verdad, así que necesita credenciales; en
el CI se salta cuando no las hay, en lugar de fallar.

Si tocaste el panel, hay Playwright en `frontend/e2e`.

---

## Estilo

- **Español** en comentarios, nombres de dominio, mensajes de interfaz y de
  commit. El código sigue el vocabulario del negocio: `envio`, `bulto`,
  `manifiesto`, `tenant`.
- **Conventional Commits con ámbito**, como el historial:
  `feat(panel): …`, `fix(backend): …`, `docs: …`.
- Comenta el **porqué**, no el qué — sobre todo donde la opción evidente era la
  equivocada. Es la convención del repositorio y la razón de que el esquema de
  Prisma se pueda leer años después.
- El bloque `<!-- BEGIN:nextjs-agent-rules -->` de `frontend/AGENTS.md` lo
  reescribe `next dev`. Va con el commit; borrarlo del diff sólo lo recrea.

---

## Pull requests

1. Rama descriptiva: `feat/aduana-liquidacion`, `fix/panel-selector-clientes`.
2. Un pull request, un tema.
3. En la descripción: qué problema resuelve, qué decisión de diseño tomaste y
   cómo lo probaste. Si añadiste tablas, di explícitamente que llevan RLS.
4. Nunca subas `.env`, credenciales, volcados de base ni capturas con datos de
   clientes reales.

---

## Seguridad

Una vulnerabilidad no se reporta en un issue. Escribe a
<Esdras.Clother@outlook.com> con los pasos para reproducirla.

Ten presente el radio de impacto antes de tocar RLS, firma de archivos o
autenticación: un fallo ahí no afecta a una empresa, sino a todas.
