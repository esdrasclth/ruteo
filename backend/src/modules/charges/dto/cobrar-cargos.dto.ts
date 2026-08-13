import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Cobrar varios cargos con un solo pago.
 *
 * **No hay «marcar pagado» a secas.** Esa era exactamente la queja de la fase 4:
 * un cargo pagado y un pago registrado eran dos hechos sueltos que nadie
 * conciliaba. Cobrar crea el `Payment` y deja los cargos apuntando a él, así que
 * la caja y lo facturado salen de la misma operación.
 */
export class CobrarCargosDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  chargeIds: string[];

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Recibo 00184' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
