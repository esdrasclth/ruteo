import { PartialType } from '@nestjs/swagger';
import { CreateAddressDto } from './create-address.dto';

/**
 * Todo opcional: corregir una colonia mal escrita no debería obligar a reenviar
 * el departamento y el municipio que ya estaban bien.
 *
 * `active` NO está aquí: archivar es una operación con su propio endpoint. Con
 * un `active: false` perdido entre los demás campos, archivar una dirección
 * pasaría inadvertido en un formulario de edición, y es lo que decide si se
 * sigue ofreciendo al crear envíos.
 */
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
