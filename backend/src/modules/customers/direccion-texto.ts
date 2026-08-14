/** Lo mínimo que hace falta para escribir una dirección en una línea. */
export interface DireccionEstructurada {
  neighborhood?: string | null;
  street?: string | null;
  municipality: string;
  department: string;
  reference?: string | null;
}

/**
 * Convierte la dirección estructurada en la línea que guarda el envío.
 *
 * **Por qué el envío guarda texto y no sólo el enlace.** El texto es la copia
 * congelada del día del envío: corregir la colonia de un cliente el año que
 * viene no puede reescribir a dónde se entregó un paquete el año pasado. El
 * enlace sirve para agrupar y corregir hacia adelante; el texto, para explicar
 * el pasado.
 *
 * El orden va de lo fino a lo grueso —calle, colonia, municipio,
 * departamento— porque es como se lee una dirección aquí y como la necesita
 * quien conduce: primero lo que busca en la esquina, al final lo que ya sabe.
 *
 * La referencia entra entre paréntesis al final y no se omite: en media
 * Honduras es lo único que lleva a la puerta, y perderla al copiar dejaría el
 * envío con una dirección peor que la que el cliente escribió.
 */
export function etiquetaDeDireccion(direccion: DireccionEstructurada): string {
  const partes = [
    direccion.street,
    direccion.neighborhood,
    direccion.municipality,
    direccion.department,
  ]
    .map((parte) => parte?.trim())
    .filter((parte): parte is string => Boolean(parte));

  const linea = partes.join(', ');
  const referencia = direccion.reference?.trim();
  return referencia ? `${linea} (${referencia})` : linea;
}
