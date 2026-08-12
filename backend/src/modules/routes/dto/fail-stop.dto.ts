import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class FailStopDto {
  @ApiProperty({ example: 'Destinatario ausente' })
  @IsString()
  @MaxLength(255)
  failureReason: string;

  /**
   * Foto del intento fallido: la puerta cerrada, la dirección que no existe, el
   * paquete rechazado.
   *
   * Es la evidencia que MÁS falta hace. Una entrega buena rara vez se discute;
   * la que se discute es la que no se pudo hacer, y ahí «el cliente no estaba»
   * sin nada que lo respalde es la palabra del repartidor contra la del
   * destinatario.
   */
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
