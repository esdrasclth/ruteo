import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus, WarehouseType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateWarehouseDto {
  /** Corto y legible: MIA-01, SPS-01. Es lo que se dice por radio. */
  @ApiProperty({ example: 'MIA-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'Bodega Miami' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: WarehouseType, default: WarehouseType.ORIGIN })
  @IsOptional()
  @IsEnum(WarehouseType)
  type?: WarehouseType;

  @ApiProperty({ example: 'US' })
  @IsString()
  @MaxLength(2)
  country: string;

  @ApiPropertyOptional({ example: 'Miami' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine?: string;

  /** Si el cliente puede venir a retirar aquí. Lo usa el modo de entrega. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowsPickup?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWarehouseDto extends CreateWarehouseDto {
  @IsOptional()
  declare code: string;

  @IsOptional()
  declare name: string;

  @IsOptional()
  declare country: string;
}

export class CreateTripDto {
  @ApiPropertyOptional({ example: 'AA-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  flightNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  carrierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  originWarehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  destinationWarehouseId?: string;

  @ApiPropertyOptional({ example: '2026-08-20T14:00:00Z' })
  @IsOptional()
  @IsDateString()
  departureAt?: string;

  @ApiPropertyOptional({ example: '2026-08-20T18:30:00Z' })
  @IsOptional()
  @IsDateString()
  arrivalAt?: string;
}

export class UpdateTripStatusDto {
  @ApiProperty({ enum: TripStatus })
  @IsEnum(TripStatus)
  status: TripStatus;
}
