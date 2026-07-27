import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRateDto {
  @ApiProperty({ example: 'Tarifa urbana estándar' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Zone this rate applies to (optional)' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional({ example: 50, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseFee?: number;

  @ApiPropertyOptional({ example: 15, default: 0, description: 'Per kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  perKg?: number;

  @ApiPropertyOptional({ example: 8, default: 0, description: 'Per km' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  perKm?: number;

  @ApiPropertyOptional({ example: 60, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minCharge?: number;

  @ApiPropertyOptional({ example: 'HNL', default: 'HNL' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
