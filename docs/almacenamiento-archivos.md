# Almacenamiento de archivos (MinIO)

Fotos de bodega, facturas, declaraciones, firmas de entrega y evidencia de
reclamos. Es la fase 0 de `docs/plan-courier.md`: sin esto, seis de los módulos
que faltan no se pueden construir, porque serían tablas de metadatos apuntando
a la nada.

## Los tres dominios, que no son intercambiables

| Dominio | Qué es | Dónde va |
| --- | --- | --- |
| `https://s3.brandsofts.com` | La API S3 | `S3_ENDPOINT` |
| `https://cdn.brandsofts.com` | La misma API, pensada para servir al navegador | `S3_PUBLIC_URL` |
| `https://storage.brandsofts.com` | La **consola web** donde entras tú | En ninguna variable |

Poner la consola en `S3_ENDPOINT` es el error fácil de cometer: son dos
aplicaciones distintas, y el fallo no dice «esto es la consola» —devuelve un XML
que el SDK no sabe interpretar—. Por eso `env.validation.ts` rechaza al arrancar
cualquier endpoint que empiece por `storage.`.

`S3_PUBLIC_URL` se separa del endpoint para poder ponerle caché o CDN delante sin
tocar el que usa el backend para firmar.

## Cómo se organiza el bucket

**Ninguna parte del código compone una clave a mano.** Se pide a `claveDe()` en
`src/storage/claves.ts`, y la forma es siempre:

```
t/{tenantId}/{categoria}/{propietarioId}/{uuid}.{ext}
```

```
t/9f3c…/fotos-paquete/1a2b…/7d8e9f10-….jpg
t/9f3c…/documentos/4c5d…/a1b2c3d4-….pdf
t/9f3c…/prueba-entrega/6e7f…/f0e1d2c3-….jpg
```

Las categorías son un enum cerrado (`CATEGORIAS`): añadir un tipo de archivo
obliga a tocar esa lista, y así no aparecen carpetas inventadas en producción
que nadie sabe quién creó.

**La empresa va primero, y eso no es estética.** El almacenamiento de objetos no
tiene RLS: lo que en Postgres impide que una empresa vea las filas de otra, aquí
no existe. Con el tenant como primer segmento, el aislamiento se puede imponer
donde sí se puede —políticas de bucket por prefijo, dar de baja una empresa con
un solo borrado recursivo, medir cuánto ocupa cada una—. Con el tenant en medio,
ninguna de esas cosas se puede expresar.

**El nombre final es un UUID, no el del archivo.** El nombre que trae el usuario
no es de fiar (acentos, espacios, barras, `../`) y dos personas subiendo
`factura.pdf` al mismo envío se pisarían. Del nombre original solo se saca la
extensión, y con un filtro; el nombre para mostrar se guarda en la base, que es
donde puede vivir sin formar parte de una ruta.

## El flujo: los binarios no pasan por el backend

```
navegador                    backend                    MinIO
    │  pide subir              │                          │
    ├─────────────────────────►│  valida tipo y tamaño    │
    │                          │  compone la clave        │
    │◄─────────────────────────┤  devuelve URL firmada    │
    │                                                     │
    ├──────────── PUT del archivo ───────────────────────►│
    │                          │                          │
    ├─ confirma ──────────────►│  HEAD: ¿existe de verdad?│
    │                          ├─────────────────────────►│
    │                          │  escribe la fila         │
```

Hacer de proxy del archivo obligaría a este proceso a sostener la subida entera
en memoria o disco: una bodega subiendo doce fotos por bulto tumbaría el backend
antes que al almacenamiento. Firmar cuesta microsegundos y no toca la red.

El `HEAD` antes de escribir la fila no es paranoia: la URL firmada se entrega y
después no se sabe qué pasó —el navegador pudo perder la conexión a mitad—. Sin
esa comprobación quedan filas apuntando a objetos que no llegaron a existir, y
eso se descubre el día que alguien abre un reclamo y la foto no está.

## Decisiones que conviene no revertir sin pensar

**Falla cerrado, al revés que Redis.** `RedisService` falla abierto a propósito:
si Redis no está, la caché falla y los frenos degradan a memoria, pero se sigue
trabajando. Aquí no hay degradación posible: decir «subido» sin haber subido
nada es peor que un error.

**Lo que se firma queda fijado.** `ContentType` y `ContentLength` van dentro de
la firma, así que quien tenga la URL no puede usarla para subir otra cosa ni algo
más grande de lo declarado. Validar solo en el navegador no sirve de nada: la URL
firmada se puede usar a mano.

**Vigencias cortas.** 15 minutos para subir (un operador con mala cobertura en
una bodega), 5 para descargar (se pide justo antes de mostrar). Una URL firmada
es una credencial portátil: quien la tenga entra, sin sesión ni permisos.

**`esDelTenant` antes de firmar cualquier lectura.** El id del archivo viaja en
la petición y quien la manda lo controla. Sin esa comprobación, leer el documento
de otra empresa es cuestión de probar identificadores. Tiene pruebas propias,
incluidos los casos que la romperían: un id que empieza igual que otro y una ruta
que mete el id de la empresa en un segmento más profundo.

**El healthcheck lo reporta pero no lo exige.** `/health/ready` devuelve
`almacenamiento: up | down | sin-configurar`, y ese valor **no** entra en el
booleano `ready`. Sin almacenamiento no hay fotos ni documentos, pero el rastreo,
las rutas, los cobros y las entregas siguen funcionando: sacar el backend del
balanceador por un MinIO caído sería tirar lo que sí sirve. `sin-configurar` es
un estado legítimo en local y no se pinta como avería, para que el aviso no se
vuelva ruido.

## Configuración

Las cuatro obligatorias van juntas o no van: `S3_ENDPOINT`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY` y `S3_BUCKET`. El arranque rechaza una configuración a medias,
porque a medias es el peor de los tres estados —el módulo se cree apagado
mientras las pantallas ofrecen subir archivos—. Sin ninguna de las cuatro, el
módulo queda dormido y se puede trabajar en local sin levantar un MinIO.

`S3_FORCE_PATH_STYLE` se queda en `true`: MinIO sirve los buckets como ruta
(`/bucket/clave`), no como subdominio. En `false`, el SDK resuelve
`ruteo.s3.brandsofts.com`, que no existe, y el error que sale es de DNS y no
señala a esta opción.

La clave secreta MinIO solo se muestra una vez, al crearla. Vive en Infisical,
no en el repositorio.
