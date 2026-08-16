import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

/**
 * Aprobar un reclamo.
 *
 * `approvedAmount` va aparte de lo reclamado y no se copia solo: la diferencia
 * entre lo que se pide y lo que se concede es lo único que después dice si la
 * política de posventa está calibrada. Rellenarlo por defecto con lo reclamado
 * haría que esa diferencia fuera siempre cero por construcción.
 */
export class ApproveClaimDto {
  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  approvedAmount?: number;

  @ApiProperty({
    example: 'Procede: las fotos de recepción muestran la caja intacta',
  })
  @IsString()
  @Length(10, 2000)
  resolution!: string;
}

export class RejectClaimDto {
  @ApiProperty({ example: 'El bulto se entregó firmado y sin observaciones' })
  @IsString()
  @Length(10, 2000)
  resolution!: string;
}

/**
 * Liquidar: aprobar ya no basta, hay que mover el dinero.
 *
 * Se pide el pago concreto que se devuelve porque un envío puede tener varios
 * —el COD y el cobro de cargos— y devolver «del envío» sin decir de cuál deja
 * la caja sin cuadrar.
 */
export class SettleClaimDto {
  @ApiProperty({ description: 'Pago del que sale el reembolso' })
  @IsUUID()
  paymentId!: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: 'Cómo se le devolvió el dinero',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Transferencia 0091823' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  reference?: string;
}
