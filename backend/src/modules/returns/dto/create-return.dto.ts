import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnDestination, ReturnReason } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateReturnDto {
  @ApiProperty()
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({ enum: ReturnDestination })
  @IsEnum(ReturnDestination)
  destination!: ReturnDestination;

  @ApiProperty({ enum: ReturnReason })
  @IsEnum(ReturnReason)
  reason!: ReturnReason;

  /** Obligatoria con destino BRANCH y prohibida en el resto; lo exige el servicio. */
  @ApiPropertyOptional({
    description: 'Sucursal a la que vuelve (sólo BRANCH)',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CompleteReturnDto {
  @ApiPropertyOptional({ example: 'Entregado al remitente, firmó Ana Motiño' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
