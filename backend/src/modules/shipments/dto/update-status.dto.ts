import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentStatus } from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateStatusDto {
  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status: ShipmentStatus;

  @ApiPropertyOptional({ example: 'Arrived at Miami consolidation hub' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @ApiPropertyOptional({ example: 'Miami, FL' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationLabel?: string;

  @ApiPropertyOptional({ example: 25.7617 })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -80.1918 })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ description: 'Associated international leg id' })
  @IsOptional()
  @IsUUID()
  legId?: string;
}
