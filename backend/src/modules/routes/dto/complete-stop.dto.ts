import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Prueba de entrega de una parada completada.
 *
 * Firma y foto llegan como CLAVE del almacenamiento —lo que devuelve
 * `POST /files/upload-url`— y no como URL.
 *
 * Antes eran `@IsUrl()`, y eso tenía dos problemas a la vez: no había forma de
 * subir un archivo, así que nadie las llenaba nunca; y de haberlas llenado,
 * cualquiera podía dejar la «prueba de entrega» apuntando a un servidor suyo,
 * que el panel habría renderizado tal cual. La evidencia de una entrega tiene
 * que ser un archivo que custodiamos nosotros, o no prueba nada.
 */
export class CompleteStopDto {
  @ApiPropertyOptional({ example: 'María López' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  receivedBy?: string;

  @ApiPropertyOptional({
    example: 't/9f3c…/prueba-entrega/1a2b…/7d8e9f10-….png',
    description: 'Clave devuelta por POST /files/upload-url',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  signatureKey?: string;

  @ApiPropertyOptional({
    example: 't/9f3c…/prueba-entrega/1a2b…/a1b2c3d4-….jpg',
    description: 'Clave devuelta por POST /files/upload-url',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoKey?: string;

  @ApiPropertyOptional({ example: 14.0932 })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -87.1876 })
  @IsOptional()
  @IsLongitude()
  lng?: number;
}
