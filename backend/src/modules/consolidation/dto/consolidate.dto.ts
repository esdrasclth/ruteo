import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ConsolidateDto {
  @ApiProperty({
    description: 'Locker whose received packages are consolidated',
  })
  @IsUUID()
  lockerId: string;

  @ApiProperty({ type: [String], description: 'Received package ids to group' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  packageIds: string[];

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MaxLength(160)
  recipientName: string;

  @ApiPropertyOptional({ example: '+504 9999-9999' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  recipientPhone?: string;

  @ApiPropertyOptional({ example: 'Tegucigalpa, HN' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  destinationLabel?: string;

  @ApiPropertyOptional({ example: 'HN', default: 'HN' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  destinationCountry?: string;

  @ApiPropertyOptional({ example: 14.0723 })
  @IsOptional()
  @IsLatitude()
  destinationLat?: number;

  @ApiPropertyOptional({ example: -87.1921 })
  @IsOptional()
  @IsLongitude()
  destinationLng?: number;
}
