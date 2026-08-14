import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryFailureReason } from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class FailStopDto {
  /**
   * Por qué no se pudo entregar, de una lista cerrada.
   *
   * Antes era texto libre, y el texto libre no se puede contar: «no estaba»,
   * «ausente», «nadie en casa» y «Ausente!!» son la misma causa escrita de
   * cuatro formas. La pregunta que la operación se hace todos los meses
   * —cuántas entregas fallan por dirección mala y cuántas porque el cliente no
   * está— no tenía respuesta, y de ahí no sale ninguna decisión.
   *
   * **Es un cambio incompatible de la API a propósito.** Aceptar también el
   * texto de antes habría dejado las dos formas conviviendo para siempre, que
   * es exactamente el problema que esto viene a cerrar.
   */
  @ApiProperty({
    enum: DeliveryFailureReason,
    example: DeliveryFailureReason.NO_RECIPIENT,
  })
  @IsEnum(DeliveryFailureReason)
  failureReason: DeliveryFailureReason;

  /**
   * El detalle a mano. Obligatorio cuando el motivo es `OTHER` —lo comprueba el
   * servicio—, porque un «Otro motivo» sin explicación no se puede revisar ni
   * ascender a categoría propia: es el texto libre de antes con menos
   * información.
   */
  @ApiPropertyOptional({
    example: 'Dejó dicho con el vigilante que pasemos por la tarde',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

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
