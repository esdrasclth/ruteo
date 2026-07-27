import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StopType } from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AddStopDto {
  @ApiProperty({ description: 'Shipment served at this stop' })
  @IsUUID()
  shipmentId: string;

  @ApiPropertyOptional({ enum: StopType, default: StopType.DELIVERY })
  @IsOptional()
  @IsEnum(StopType)
  type?: StopType;

  @ApiPropertyOptional({ example: 'Col. Palmira, Tegucigalpa' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLabel?: string;

  @ApiPropertyOptional({ example: 14.0932 })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -87.1876 })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Entregar en recepción' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
