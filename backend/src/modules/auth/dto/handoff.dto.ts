import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class HandoffDto {
  /**
   * El vale que emitió el login del panel raíz, tal cual venía en la URL.
   *
   * El largo se acota por higiene, no por seguridad: son 32 bytes en base64url,
   * o sea 43 caracteres. Aceptar cadenas de cualquier tamaño solo sirve para
   * que alguien mande megabytes y se paguen sus hashes.
   */
  @ApiProperty({ example: 'k7nQ…' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  code: string;
}
