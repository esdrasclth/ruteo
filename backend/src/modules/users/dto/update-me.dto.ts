import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Lo que uno puede cambiar de sí mismo.
 *
 * **Sólo el nombre, y es a propósito.** `UpdateUserDto` —el de
 * `PATCH /users/:id`, que usan OWNER y ADMIN sobre otras personas— acepta
 * además `role` y `status`. Reutilizarlo aquí dejaría que cualquiera se
 * ascendiera a OWNER con una petición a su propio identificador: el endpoint
 * está abierto a todos los roles porque cambiarse el nombre lo hace cualquiera,
 * y esa apertura es justo lo que hace peligroso compartir el DTO.
 *
 * **El correo no está y no es un olvido.** Es el identificador con el que se
 * entra, así que cambiarlo es volver a verificarlo y decidir qué pasa con la
 * sesión abierta mientras tanto.
 * Es una funcionalidad con su propio flujo, no un campo más de este formulario.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Sandra Milla' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;
}
