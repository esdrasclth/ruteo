import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Lo que se acepta como foto de perfil.
 *
 * Más estrecho que el almacenamiento general a propósito. `TIPOS_PERMITIDOS`
 * del `StorageService` incluye PDF porque ahí también viajan facturas y guías
 * aéreas; un PDF como foto de perfil sólo puede acabar en un avatar roto.
 */
export const TIPOS_DE_AVATAR = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Tope propio, y muy por debajo de los 25 MB del bucket.
 *
 * Una foto de perfil se pinta a 40 píxeles. Aceptar la foto de 20 MB que sale
 * de un móvil moderno es pagar almacenamiento y ancho de banda cada vez que se
 * carga el panel, para enseñar un círculo diminuto.
 */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export class AvatarUploadUrlDto {
  @ApiProperty({ enum: TIPOS_DE_AVATAR, example: 'image/jpeg' })
  @IsIn(TIPOS_DE_AVATAR, {
    message: 'La foto tiene que ser JPG, PNG o WebP.',
  })
  contentType!: string;

  @ApiProperty({ example: 204800, maximum: MAX_AVATAR_BYTES })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AVATAR_BYTES, { message: 'La foto no puede pasar de 5 MB.' })
  sizeBytes!: number;

  @ApiProperty({ example: 'yo.jpg' })
  @IsString()
  @MaxLength(255)
  nombreOriginal!: string;
}

export class FijarAvatarDto {
  /**
   * La clave que devolvió `upload-url`. No se acepta un `fileId` ya creado: eso
   * permitiría apuntar el avatar a cualquier archivo de la empresa —la foto de
   * un bulto, la factura de un cliente— con sólo conocer su identificador.
   */
  @ApiProperty({ example: 't/9f3c…/avatares/1a2b…/7d8e….jpg' })
  @IsString()
  @MaxLength(500)
  clave!: string;

  @ApiProperty({ example: 'yo.jpg' })
  @IsString()
  @MaxLength(255)
  nombreOriginal!: string;
}
