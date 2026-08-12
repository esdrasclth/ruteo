import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cierra una subida y crea la fila de metadatos.
 *
 * Es un paso aparte y no un efecto de la subida porque el backend **no se
 * entera** de que el `PUT` ocurrió: el navegador sube directo al almacenamiento.
 * Sin este aviso, la única forma de saber qué hay en el bucket sería recorrerlo.
 */
export class ConfirmUploadDto {
  @ApiProperty({ example: 't/9f3c…/fotos-paquete/1a2b…/7d8e9f10-….jpg' })
  @IsString()
  @MaxLength(500)
  clave: string;

  @ApiProperty({ example: 'caja.jpg', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombreOriginal?: string;
}
