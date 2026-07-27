import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LegMode } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateLegDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  sequence: number;

  @ApiProperty({ enum: LegMode })
  @IsEnum(LegMode)
  mode: LegMode;

  @ApiProperty({ example: 'Miami, FL' })
  @IsString()
  @MaxLength(160)
  originLabel: string;

  @ApiProperty({ example: 'Tegucigalpa, HN' })
  @IsString()
  @MaxLength(160)
  destinationLabel: string;

  @ApiPropertyOptional({ example: 25.7959 })
  @IsOptional()
  @IsLatitude()
  originLat?: number;

  @ApiPropertyOptional({ example: -80.287 })
  @IsOptional()
  @IsLongitude()
  originLng?: number;

  @ApiPropertyOptional({ example: 14.0723 })
  @IsOptional()
  @IsLatitude()
  destinationLat?: number;

  @ApiPropertyOptional({ example: -87.1921 })
  @IsOptional()
  @IsLongitude()
  destinationLng?: number;

  @ApiPropertyOptional({ example: 'DHL' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string;

  @ApiPropertyOptional({ description: 'Carrier catalog id (optional link)' })
  @IsOptional()
  @IsUUID()
  carrierId?: string;

  @ApiPropertyOptional({ example: '1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalTracking?: string;

  @ApiPropertyOptional({ example: '2026-07-20T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  etaAt?: string;
}
