import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClaimType } from '@prisma/client';
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

export class CreateClaimDto {
  @ApiProperty({ example: '9f3c0e2a-1b4d-4c5e-8f7a-2b3c4d5e6f70' })
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({ enum: ClaimType })
  @IsEnum(ClaimType)
  type!: ClaimType;

  /**
   * Mínimo de 10 caracteres por lo mismo que el motivo de borrado de una
   * empresa: «dañado» como descripción no le sirve a quien tiene que decidir
   * tres semanas después, y es justo lo que se escribe con prisa.
   */
  @ApiProperty({ example: 'La caja llegó abierta y falta el cargador' })
  @IsString()
  @Length(10, 2000)
  description!: string;

  @ApiPropertyOptional({
    description: 'Bulto concreto, si el reclamo es de uno',
  })
  @IsOptional()
  @IsUUID()
  packageId?: string;

  @ApiPropertyOptional({ description: 'Cliente que reclama' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Excepción interna de la que sale' })
  @IsOptional()
  @IsUUID()
  exceptionId?: string;

  @ApiPropertyOptional({
    description: 'Sólo en WRONG_CHARGE: el cargo que se discute',
  })
  @IsOptional()
  @IsUUID()
  chargeId?: string;

  /** Puede no pedir cifra: «que me digan dónde está» también es un reclamo. */
  @ApiPropertyOptional({ example: 120.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  claimedAmount?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;
}
