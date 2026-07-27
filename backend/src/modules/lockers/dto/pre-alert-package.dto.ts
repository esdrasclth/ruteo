import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class PreAlertPackageDto {
  @ApiPropertyOptional({
    example: '1Z999AA10123456784',
    description: 'Carrier tracking number of the incoming package',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalTracking?: string;

  @ApiPropertyOptional({ example: 'Amazon' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant?: string;

  @ApiPropertyOptional({ example: 'Auriculares Bluetooth' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number;

  @ApiPropertyOptional({ example: 79.99 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  declaredValue?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
