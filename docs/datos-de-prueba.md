# Datos de prueba y guion de pruebas del panel

Juego de datos coherente para recorrer **todo** el sistema desde el panel web, en orden.
Cada paso dice qué hacer y **qué deberías ver**; si lo que ves no coincide, ahí hay algo que revisar.

Verificado contra el código el 2026-07-28 (campos, enums, fórmulas y máquina de estados).

## Antes de empezar

| Servicio | URL |
|---|---|
| Panel | http://localhost:3001 |
| API | http://localhost:3002/api |
| Swagger | http://localhost:3002/docs |

La base **está vacía** (0 tenants), así que el primer paso es registrarse: no hay usuario de demo.

**Para anotar mejoras mientras recorres:** apunta cada hallazgo con la fase y la pantalla
(`4.3 /routes — optimizar no avisa cuándo no cambió el orden`). Separa lo que es **fallo**
(no coincide con el "Esperado") de lo que es **mejora** (funciona, pero se siente pobre) —
son dos arreglos distintos. Antes de anotar un fallo, mira la tabla del final: hay seis
comportamientos que parecen errores y son intencionales.

---

## Fase 1 — Crear la cuenta

Ve a http://localhost:3001/register.

| Campo | Valor |
|---|---|
| Nombre del negocio | `Encomiendas Catracha` |
| Slug | `encomiendas-catracha` |
| Correo | `admin@catracha.hn` |
| Contraseña | `Catracha2026!` |

Reglas reales: el slug solo acepta minúsculas, números y guiones; la contraseña necesita mínimo 8 caracteres.

**Esperado:** entras al panel con rol OWNER y el plan arranca en FREE.
El slug hace falta también para iniciar sesión después — anótalo.

---

## Fase 2 — Catálogos base

### 2.1 Clientes → `/customers`

| Nombre | Correo | Teléfono | Documento |
|---|---|---|---|
| `María Fernanda López` | `maria.lopez@correo.hn` | `+50499112233` | `0801-1990-01234` |
| `Carlos Discua` | `carlos.discua@correo.hn` | `+50488445566` | `0501-1988-05566` |
| `Tienda La Ceiba` | `ventas@laceiba.hn` | `+50497001122` | |

**Prueba el buscador sin tildes:** escribe `lopez` (sin acento) y debe aparecer *López*. Está resuelto con `unaccent` de Postgres a propósito.

### 2.2 Zonas → `/pricing`

| Nombre | Código | Lat | Lng | Radio (km) |
|---|---|---|---|---|
| `Tegucigalpa Centro` | `TGU-C` | `14.0723` | `-87.1921` | `8` |
| `Comayagüela` | `TGU-CMY` | `14.0950` | `-87.2200` | `6` |
| `San Pedro Sula` | `SPS` | `15.5040` | `-88.0250` | `10` |

El buscador de puntos rellena lat/lng solo: prueba escribiendo `Boulevard Morazán` y elige una sugerencia.

### 2.3 Tarifas → `/pricing`

| Nombre | Zona | Base | Por kg | Por km | Mínimo |
|---|---|---|---|---|---|
| `Tarifa urbana estándar` | Tegucigalpa Centro | `50` | `15` | `8` | `60` |
| `Tarifa interurbana` | General (sin zona) | `120` | `25` | `12` | `150` |

**Cotizador** (misma página): peso `2.5`, distancia `7`, zona `Tegucigalpa Centro`.

**Esperado: 143.50** → 50 base + 37.50 (2.5 kg × 15) + 56 (7 km × 8). Supera el mínimo de 60, así que gana la suma.

### 2.4 Transportistas → `/carriers`

| Nombre | Código | Tipo | URL de rastreo |
|---|---|---|---|
| `DHL Express` | `DHL` | COURIER | `https://www.dhl.com/track?id={tracking}` |
| `Copa Airlines Cargo` | `CM` | AIRLINE | |
| `Transportes Handal` | `THL` | GROUND | |

El `{tracking}` es un placeholder literal: se sustituye por la guía real en el rastreo público.

### 2.5 Repartidores → `/drivers`

| Nombre | Teléfono | Vehículo | Placa |
|---|---|---|---|
| `José Amaya` | `+50499887766` | MOTORCYCLE | `HAB-1234` |
| `Wilmer Zelaya` | `+50488990011` | VAN | `PBC-5678` |

Cambia el estado de José a **BUSY** desde el badge de la tabla y vuelve a AVAILABLE: se edita en línea.

### 2.6 Equipo → `/team`

Crea un operador: correo `operaciones@catracha.hn`, nombre `Sandra Milla`, rol **OPERATOR**, contraseña `Catracha2026!`.
Opcionalmente vincula un usuario DRIVER a José Amaya para que pueda entrar con su propia cuenta.

---

## Fase 3 — Flujo internacional USA → Honduras

Esta es la funcionalidad estrella. **Ojo con un detalle que confunde:** un envío internacional **no se crea desde "Nuevo envío"**. Nace de la consolidación del casillero y aparece directamente en estado `CONSOLIDATED`, saltándose `CREATED` y `RECEIVED_USA`.

### 3.1 Casillero → `/lockers`

| Campo | Valor |
|---|---|
| Cliente | `María Fernanda López` |
| Correo | `maria.lopez@correo.hn` |
| Teléfono | `+50499112233` |
| Dirección (bodega USA) | `8001 NW 25th St` |
| Ciudad / Estado / ZIP | `Miami` / `FL` / `33122` |

**Esperado:** se genera un código `BOX-XXXXXX` y el cliente queda vinculado. Si creas otro casillero con el mismo teléfono, **reusa el mismo cliente** en vez de duplicarlo.

### 3.2 Pre-alertas → entra al casillero

| Guía del carrier | Comercio | Descripción | Peso (kg) | Valor (USD) |
|---|---|---|---|---|
| `1Z999AA10123456784` | `Amazon` | `Audífonos Sony WH-1000XM5` | `0.5` | `320` |
| `TBA305482910233` | `Amazon` | `Cafetera Ninja` | `3.2` | `145` |
| `9400111899223197428490` | `SHEIN` | `Ropa (5 piezas)` | `1.1` | `78` |

### 3.3 Recepción en bodega → `/intake`

Aquí se prueba el emparejado, que es lo interesante:

1. **Paquete ya pre-alertado:** registra un recibo con la guía `1Z999AA10123456784` en el casillero de María. **Esperado:** lo marca RECEIVED y avisa que *emparejó* — no crea un duplicado.
2. **Paquete walk-in:** registra `TBA999888777666` / `eBay` / `Repuesto de laptop` / `0.8` kg / `95` USD. **Esperado:** crea uno nuevo ya en RECEIVED.
3. Los otros dos pre-alertados recíbelos con el botón **Recibir** del feed de pendientes.

**Esperado al terminar:** 0 pre-alertas pendientes y 4 recibidos. Cada recepción dispara una notificación al cliente (se verifica en la Fase 8).

### 3.4 Consolidación → dentro del casillero

Selecciona los **3 paquetes originales** (no el walk-in) y consolida:

| Campo | Valor |
|---|---|
| Destinatario en HN | `María Fernanda López` |
| Teléfono | `+50499112233` |
| Destino | `Col. Palmira, Tegucigalpa` |

**Esperado:** se crea un envío `RUT-XXXXXXXXXX` de tipo INTERNACIONAL en estado `CONSOLIDATED`, con **peso 4.8 kg** (0.5+3.2+1.1) y **valor 543 USD** (320+145+78). El panel te lleva al envío.

### 3.5 Tramo aéreo → en el detalle del envío

| Campo | Valor |
|---|---|
| Modo | AIR |
| Origen | `Miami, FL` |
| Destino | `Tegucigalpa, HN` |
| Transportista | `DHL Express` |
| Guía | `1Z999AA10123456784` |
| Llegada estimada | mañana |

Pon el tramo **IN_PROGRESS** y luego **COMPLETED**. Cada cambio real de estado notifica al destinatario; repetir el mismo estado o editar solo metadatos **no** notifica (es intencional).

### 3.6 Aduana → tarjeta "Aduana" del envío

| Campo | Valor |
|---|---|
| Valor declarado | `543` |
| Arancel (dutyRate) | `0.15` |
| ISV (taxRate) | `0.15` |
| Manejo | `10` |

**Esperado**, con la fórmula real (`arancel = valor × tasa`; `ISV = (valor + arancel) × tasa`):

| Concepto | Monto |
|---|---|
| Arancel | 81.45 |
| ISV | 93.6675 |
| Manejo | 10 |
| **Total** | **185.1175** |

Pulsa **Liberar** → estado CLEARED.
**Trampa:** liberar aduana **no** cambia el estado del envío. El envío sigue donde estaba; las transiciones son manuales.

### 3.7 Recorrido de estados

Ruta internacional válida, en este orden exacto:

`CONSOLIDATED → IN_TRANSIT_INTL → IN_CUSTOMS_HN → CUSTOMS_CLEARED → IN_WAREHOUSE_HN → OUT_FOR_DELIVERY → DELIVERED`

Desde `IN_CUSTOMS_HN` también puedes desviarte a `ON_HOLD_CUSTOMS` (retención) y de ahí a `CUSTOMS_CLEARED`. El panel solo ofrece las transiciones válidas; si intentas una inválida por API, responde 400.

### 3.8 Rastreo público

Copia el `RUT-...` y ábrelo **sin sesión** (ventana de incógnito) en `/track`.

**Esperado:** estado y ETA, mapa con la ruta del tramo, resumen de aduana con los cargos, el tramo con su badge y el enlace externo a DHL construido con la plantilla `{tracking}`, y la línea de tiempo de eventos. No debe mostrar datos sensibles del negocio.

---

## Fase 4 — Flujo local con cobro contra entrega

### 4.1 Tres envíos locales → `/shipments/new`

| Destinatario | Teléfono | Destino | Lat | Lng | Peso | COD | Moneda |
|---|---|---|---|---|---|---|---|
| `Carlos Discua` | `+50488445566` | `Col. Kennedy, Tegucigalpa` | `14.0650` | `-87.1920` | `2.5` | `350` | HNL |
| `Tienda La Ceiba` | `+50497001122` | `Barrio Guanacaste, Tegucigalpa` | `14.0810` | `-87.2050` | `1.2` | `0` | HNL |
| `Rosa Mejía` | `+50496554433` | `Res. El Trapiche, Tegucigalpa` | `14.1020` | `-87.1850` | `4.0` | `520` | HNL |

Usa el buscador de direcciones en el campo **Destino**: al elegir una sugerencia rellena lat/lng solo. Las coordenadas de la tabla son el respaldo si prefieres escribirlas.

**Esperado:** cada envío con COD > 0 abre automáticamente un pago **PENDING** (compruébalo en `/payments`).

### 4.2 Etiqueta

En el detalle del primer envío, descarga la etiqueta: SVG de 100×150 con código de barras Code128 del tracking y un QR que apunta al rastreo público.

### 4.3 Ruta de reparto → `/routes`

Crea la ruta con driver **José Amaya** y fecha de hoy. Entra a la ruta y **agrega los 3 envíos como paradas** (la dirección y coordenadas se prellenan del envío).

1. Pulsa **Optimizar**: reordena por vecino más cercano. Con esas coordenadas la secuencia cambia respecto al orden de alta.
2. Pasa la ruta a **IN_PROGRESS**.

**Trampa de UI:** las paradas solo se pueden editar mientras la ruta está en PLANNED.

### 4.4 Entregas

Para cada parada: **Llegué** → luego **Entregar** con `Recibido por: Carlos Discua`.
En la última parada prueba **Falló** con motivo `Destinatario ausente`, y después vuelve a entregarla.

**Esperado:** al completar la parada, el envío avanza solo y el COD pasa a **COLLECTED** sin tocar nada más.

**Trampa importante:** si el envío está en `CREATED`, completar la parada **no** cambia su estado — la transición no aplica y se ignora en silencio. Para que la cadena funcione, lleva antes el envío por `LABEL_GENERATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY`.

### 4.5 Pagos → `/payments`

Cobra manualmente el pago que quede PENDING (método CASH, referencia `REC-00123`, driver José Amaya) y luego pulsa **Remitir** sobre uno COLLECTED.

**Esperado:** las tarjetas de resumen mueven los totales entre PENDING / COLLECTED / REMITTED.

---

## Fase 5 — Importación masiva → `/shipments/import`

Descarga la plantilla desde la propia página y pega estas filas. Las columnas exactas son:

```
type,recipientName,recipientPhone,originLabel,originCountry,destinationLabel,destinationCountry,destinationLat,destinationLng,weightKg,declaredValue,codAmount,currency
LOCAL,Juan Pérez,+50499001122,Bodega Central,HN,Col. Kennedy Tegucigalpa,HN,14.065,-87.192,2.5,,350,HNL
LOCAL,María García,+50488334455,Bodega Central,HN,Comayagüela,HN,14.09,-87.21,1.2,,,HNL
LOCAL,Óscar Fúnez,+50497221133,Bodega Central,HN,Col. Miraflores,HN,14.081,-87.183,3.4,,180,HNL
LOCAL,,+50499000000,Bodega Central,HN,Sin nombre,HN,14.07,-87.19,1,,,HNL
LOCAL,Lat inválida,+50499000001,Bodega Central,HN,Fuera del mundo,HN,999,-87.19,1,,,HNL
```

**Esperado: 3 creados y 2 errores**, reportados por número de línea (una fila sin destinatario y otra con latitud 999). El lote **no** se aborta por las filas malas.

---

## Fase 6 — Integraciones → `/integrations`

1. **API key**: crea una con nombre `Integración tienda`. La clave completa `rk_..._...` se muestra **una sola vez**; cópiala. En la tabla solo verás el prefijo enmascarado.
2. Pruébala desde la terminal:

```bash
curl -s -X POST http://localhost:3002/api/shipments \
  -H "x-api-key: PEGA_AQUI_LA_CLAVE" -H "Content-Type: application/json" \
  -d '{"type":"LOCAL","recipientName":"Prueba API","destinationLabel":"Tegucigalpa","weightKg":1}'
```

3. **Revócala** y repite el curl: **esperado 401**.
4. **Webhook**: crea un endpoint con URL `https://webhook.site/<tu-id>` y evento `shipment.status_changed`. Cambia el estado de cualquier envío y comprueba que llega la petición firmada con la cabecera `x-ruteo-signature`.

---

## Fase 7 — Facturación y cuotas → `/billing`

El plan FREE limita a **50 envíos** por período. La barra de uso se pone roja al 90 %.

- Suscribe el plan **PRO**. **Esperado:** la suscripción queda ACTIVE, el plan del negocio cambia y se abre un pago de tipo SUBSCRIPTION en PENDING (visible en `/payments`).
- **Detalle de diseño:** al suscribir, el período arranca *en ese momento*, así que el contador de envíos usados se reinicia.
- Prueba **Cancelar al final del período**: sigue ACTIVE pero marcado para no renovar.

---

## Fase 8 — Verificación transversal

Con todo lo anterior hecho, estas pantallas deben tener contenido real:

| Pantalla | Qué comprobar |
|---|---|
| `/dashboard` | Totales por estado, tasa de entrega y la serie diaria con barras. La analítica ampliada (envíos por estado y tipo, pagos agrupados, COD por repartidor) vive aquí mismo: no hay página `/analytics` aparte |
| `/notifications` | SMS de cambios de estado, de recepción en casillero y de hitos de tramo |
| `/audit` | `shipment.status_changed`, `payment.collected`, `payment.remitted`, `api_key.created`, `api_key.revoked`, `subscription.changed` — con actor y metadatos |
| Buscador global | Con **Ctrl+K**: busca `RUT-`, un cliente o un casillero y salta directo al registro |
| `/customers/[id]` | El cliente María debe agregar su casillero, sus envíos y su resumen de pagos |

**Idempotencia:** el panel manda una `idempotency-key` en cada alta de envío. Para probarla, repite el mismo POST con la misma cabecera: devuelve el **mismo** envío en vez de duplicarlo.

---

## Prueba de aislamiento multi-tenant

Registra un segundo negocio (`Cargo Sula` / `cargo-sula` / `admin@cargosula.hn`) y entra con él.

**Esperado:** listas vacías en todo, 404 al abrir por URL el ID de un envío del primer tenant, y su propio contador de cuota. Es la garantía central del SaaS y está respaldada por 53 pruebas automáticas (`npm run test:e2e` en `backend/`).

---

## Comportamientos que parecen fallos y no lo son

| Lo que ves | Por qué pasa |
|---|---|
| Liberar aduana no cambia el estado del envío | Las transiciones de estado son manuales, por diseño |
| Completar una parada no mueve el envío | La transición desde ese estado no aplica; se ignora en silencio |
| No se puede editar paradas de una ruta iniciada | Regla de la interfaz: solo en PLANNED |
| El mapa dibuja líneas rectas | OSRM no responde; el sistema cae a líneas rectas sin romperse |
| La clave de API no se vuelve a ver | Se guarda solo el hash; el texto plano se muestra una única vez |
| Un envío internacional no aparece en `CREATED` | Nace de la consolidación ya en `CONSOLIDATED` |
