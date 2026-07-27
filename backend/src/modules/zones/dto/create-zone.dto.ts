import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateZoneDto {
  @ApiProperty({ example: 'Tegucigalpa Centro' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'TGU-C', description: 'Unique code per tenant' })
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiPropertyOptional({ example: 'Zona urbana centro' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 14.0723 })
  @IsOptional()
  @IsLatitude()
  centerLat?: number;

  @ApiPropertyOptional({ example: -87.1921 })
  @IsOptional()
  @IsLongitude()
  centerLng?: number;

  @ApiPropertyOptional({ example: 5, description: 'Coverage radius in km' })
  @IsOptional()
  @IsPositive()
  radiusKm?: number;
}
