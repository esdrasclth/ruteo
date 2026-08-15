# API para las empresas: casilleros desde su propia web

Una empresa puede emitir llaves de API y usarlas para que **sus** clientes abran
casillero y prealerten compras desde su sitio web, sin que un operador teclee
nada en el panel.

Este documento es lo que hay que entregarle a quien programe esa integración.

---

## Lo primero, porque es lo que se hace mal

**La llave va en el servidor, nunca en el navegador.** Si la llave aparece en el
JavaScript de la página, cualquiera que abra el inspector la copia, y a partir de
ahí tiene sobre los datos de la empresa exactamente los permisos que se le dieron.

El flujo correcto tiene tres saltos:

```
cliente final ──▶ web de la empresa ──▶ servidor de la empresa ──▶ Ruteo
   (formulario)      (sin la llave)        (guarda la llave)      (x-api-key)
```

Ruteo empuja hacia ahí por su cuenta: **CORS sólo admite los dominios del panel**,
así que una llamada hecha desde el navegador en el dominio de la empresa se
bloquea. No es un obstáculo que haya que rodear; es la parte del diseño que
impide publicar la llave sin darse cuenta.

---

## Emitir la llave

Panel → **Integraciones** → *Nueva API key*. La emiten los roles OWNER y ADMIN, y
la cuenta necesita el correo verificado.

Al crearla se eligen sus **permisos**. La llave completa
(`rk_<prefijo>_<secreto>`) se muestra **una sola vez**: de ella sólo se guarda el
prefijo y un hash, así que si se pierde no hay forma de recuperarla — se revoca y
se emite otra.

| Permiso | Qué abre |
| --- | --- |
| `LOCKERS_WRITE` | Crear casilleros y registrar prealertas |
| `LOCKERS_READ` | Consultar casilleros y sus bultos |
| `SHIPMENTS_WRITE` | Crear envíos, uno a uno o por CSV |
| `SHIPMENTS_READ` | Consultar envíos y descargar etiquetas |

Para el caso de este documento bastan los dos de casilleros.

**Lo que una llave no puede hacer, se le den los permisos que se le den:** recibir
bultos en bodega, subir fotos, cotejar manifiestos, mover estados de envío, cobrar
o tocar la configuración. Eso es operación interna y exige sesión de una persona.
Un endpoint sin permisos declarados rechaza a las llaves por omisión, así que lo
que se añada mañana nace cerrado.

---

## Usar la llave

La llave viaja en la cabecera `x-api-key`. No se combina con `Authorization`.

### Abrir un casillero

```bash
curl -X POST http://localhost:3002/api/lockers \
  -H "x-api-key: rk_abc123_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Juan Pérez",
    "customerEmail": "juan@example.com",
    "customerPhone": "+504 9999-9999",
    "addressLine1": "8001 NW 25th St",
    "city": "Miami",
    "state": "FL",
    "postalCode": "33122"
  }'
```

Devuelve el casillero con su `code` (`BOX-XXXXXX`) generado. **El cliente se crea
o se reutiliza solo**: si el teléfono o el correo ya existen en la empresa, el
casillero se engancha a ese cliente en vez de duplicarlo.

De ahí sale la advertencia que hay que tener presente al montar el formulario:
**el emparejado es por contacto y Ruteo no verifica que quien lo escribe sea su
dueño**. Quien ponga el teléfono de otra persona queda enganchado a su ficha. Si
el formulario es abierto, verifica el correo o el teléfono **antes** de llamar a
Ruteo; el sitio para hacerlo es el servidor de la empresa, que es quien conoce a
sus clientes.

### Prealertar una compra

```bash
curl -X POST http://localhost:3002/api/lockers/<lockerId>/packages \
  -H "x-api-key: rk_abc123_..." \
  -H "Content-Type: application/json" \
  -d '{
    "externalTracking": "1Z999AA10123456784",
    "merchant": "Amazon",
    "description": "Audífonos",
    "declaredValue": 89.99
  }'
```

El bulto nace `PRE_ALERTED`. Cuando llegue a la bodega, un operador lo recibe
desde el panel y —si hay `externalTracking` igual— **se empareja con la prealerta
en vez de duplicarla**.

### Consultar

```bash
curl http://localhost:3002/api/lockers -H "x-api-key: ..."                    # casilleros
curl http://localhost:3002/api/lockers/<id> -H "x-api-key: ..."               # uno, con sus bultos
curl "http://localhost:3002/api/lockers/<id>/packages?status=RECEIVED" -H "x-api-key: ..."
```

Para que el cliente final vea por dónde viene su paquete no hace falta llave: el
rastreo público (`GET /api/tracking/:trackingNumber`) es abierto y no expone datos
sensibles.

---

## Respuestas que hay que saber tratar

| Código | Qué pasó |
| --- | --- |
| `401` | Llave ausente, mal formada, inexistente o revocada |
| `403` | La llave no tiene el permiso que ese endpoint pide — o la empresa está suspendida, o el módulo no entra en su plan |
| `429` | Se pasó del cupo: **60 peticiones por minuto** por llave en casilleros |
| `400` | El cuerpo no valida. El mensaje dice qué campo |

El `429` trae `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `Retry-After`. El
cupo se cuenta **por llave**, así que una integración que se desboque no deja sin
servicio a las demás de la misma empresa.

---

## Aislamiento entre empresas

No hay nada que configurar: **la llave es la empresa**. El prefijo resuelve el
tenant antes de tocar ningún dato, y a partir de ahí toda la consulta corre bajo
las políticas de Row Level Security de PostgreSQL, que filtran en la base y no en
el código. Una llave de una empresa no puede leer ni escribir en otra aunque el
identificador que pida sea de la vecina: lo que recibe es un 404.

---

## Revocar

Panel → **Integraciones** → papelera. Es inmediato: la siguiente petición con esa
llave recibe `401`. Conviene emitir una llave por integración —no una para todo—
justamente para poder revocar una sin apagar las demás.

Cada emisión y cada revocación quedan en la bitácora de auditoría, con quién lo
hizo y con qué permisos nació la llave.
