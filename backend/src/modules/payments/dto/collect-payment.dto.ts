import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CollectPaymentDto {
  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Driver who collected the payment' })
  @IsOptional()
  @IsUUID()
  collectedByDriverId?: string;

  @ApiPropertyOptional({ example: 'Recibo #A-102' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
