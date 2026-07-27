import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDriverDto {
  @ApiProperty({ example: 'Carlos Martínez' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: '+504 8888-8888' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ enum: VehicleType, default: VehicleType.MOTORCYCLE })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ example: 'HAB-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehiclePlate?: string;

  @ApiPropertyOptional({ description: 'Zone the driver covers' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional({ description: 'Linked platform user (optional)' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
