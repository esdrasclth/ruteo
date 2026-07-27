import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarrierType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCarrierDto {
  @ApiProperty({ example: 'DHL Express' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'DHL', description: 'Unique code per tenant' })
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiPropertyOptional({ enum: CarrierType, default: CarrierType.COURIER })
  @IsOptional()
  @IsEnum(CarrierType)
  type?: CarrierType;

  @ApiPropertyOptional({
    example: 'https://www.dhl.com/track?id={tracking}',
    description: 'Tracking URL template with a {tracking} placeholder',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  trackingUrlTemplate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
