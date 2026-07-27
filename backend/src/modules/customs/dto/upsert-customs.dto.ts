import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomsStatus } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertCustomsDto {
  @ApiProperty({ description: 'Shipment this customs record belongs to' })
  @IsUUID()
  shipmentId: string;

  @ApiPropertyOptional({ example: 250.0, description: 'Declared value (USD)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  declaredValue?: number;

  @ApiPropertyOptional({ example: 0.15, description: 'Duty rate (0-1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  dutyRate?: number;

  @ApiPropertyOptional({ example: 0.15, description: 'Tax/ISV rate (0-1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  taxRate?: number;

  @ApiPropertyOptional({ example: 10.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  handlingFee?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ enum: CustomsStatus })
  @IsOptional()
  @IsEnum(CustomsStatus)
  status?: CustomsStatus;

  @ApiPropertyOptional({ example: 'Requiere factura comercial' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
