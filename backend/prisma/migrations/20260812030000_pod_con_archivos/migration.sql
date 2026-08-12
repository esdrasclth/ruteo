-- La prueba de entrega pasa a guardar CLAVES del almacenamiento, no URLs.
--
-- Las columnas existían desde el principio y no las llenaba nadie: no había
-- forma de subir un archivo en todo el backend, así que firma y foto eran dos
-- columnas de texto permanentemente nulas. El DTO además aceptaba cualquier URL
-- (`@IsUrl`), de modo que un cliente podía dejar apuntando la "prueba de
-- entrega" a un servidor suyo —o a cualquier otro— y el panel lo habría
-- renderizado tal cual en un `<img>`.
--
-- Ahora se guarda la clave que devuelve la subida firmada, y la URL se firma al
-- LEER, con vigencia corta. Renombrar en vez de añadir columnas nuevas evita
-- dejar dos pares conviviendo, con la duda perpetua de cuál es el bueno.
--
-- El renombrado conserva lo que hubiera. Si alguna fila trajera una URL
-- completa de antes, `firmarPod` la reconoce por el prefijo http y la devuelve
-- tal cual en vez de intentar firmarla como clave: los datos viejos siguen
-- viéndose.
ALTER TABLE "proof_of_deliveries" RENAME COLUMN "signature_url" TO "signature_key";
ALTER TABLE "proof_of_deliveries" RENAME COLUMN "photo_url" TO "photo_key";
