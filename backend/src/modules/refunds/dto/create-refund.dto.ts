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

export class CreateRefundDto {
  @ApiProperty({ description: 'Pago cobrado del que sale el dinero' })
  @IsUUID()
  paymentId!: string;

  @ApiProperty({ example: 250.0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  /**
   * Obligatorio y con largo mínimo: un reembolso sin motivo escrito es el que
   * nadie sabe explicar cuando la caja no cuadra a fin de mes.
   */
  @ApiProperty({ example: 'Se canceló el envío después de cobrar el flete' })
  @IsString()
  @Length(10, 500)
  reason!: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Transferencia 0091823' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  reference?: string;
}
