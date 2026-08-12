import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CATEGORIAS } from '../../../storage/claves';

/**
 * Categorías que HOY se pueden pedir.
 *
 * `CATEGORIAS` tiene seis; aquí solo están las que tienen consumidor escrito.
 * Abrirlas todas convertiría esto en un «sube lo que quieras a la carpeta que
 * quieras»: espacio pagado, sin nada que lo referencie y sin nadie que lo
 * borre. Cada fase del plan abre la suya cuando tiene quién la use.
 */
export const CATEGORIAS_ABIERTAS = [
  CATEGORIAS.PRUEBA_ENTREGA,
  CATEGORIAS.FOTOS_PAQUETE,
  CATEGORIAS.DOCUMENTOS,
] as const;

export type CategoriaAbierta = (typeof CATEGORIAS_ABIERTAS)[number];

export class UploadUrlDto {
  @ApiProperty({
    enum: CATEGORIAS_ABIERTAS,
    example: CATEGORIAS.FOTOS_PAQUETE,
  })
  @IsIn(CATEGORIAS_ABIERTAS)
  categoria: CategoriaAbierta;

  /**
   * A qué cuelga el archivo: la parada, para la prueba de entrega; el bulto,
   * para fotos y factura. Se comprueba que exista en esta empresa; si no,
   * cualquiera podría llenar el bucket con carpetas de identificadores
   * inventados que nada referencia y nadie va a borrar.
   */
  @ApiProperty({ example: '9f3c0e2a-1b4d-4c5e-8f7a-2b3c4d5e6f70' })
  @IsUUID()
  propietarioId: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(100)
  contentType: string;

  // El tamaño se declara ANTES de firmar porque va dentro de la firma: así la
  // URL no sirve para subir algo más grande de lo dicho. El tope real lo pone
  // `StorageService`; aquí solo se acota a algo sensato para no firmar
  // disparates.
  @ApiProperty({ example: 482913 })
  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  sizeBytes: number;

  @ApiProperty({ example: 'caja.jpg', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombreOriginal?: string;
}
