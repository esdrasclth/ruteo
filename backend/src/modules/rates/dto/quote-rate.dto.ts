import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsUUID, Min } from 'class-validator';

export class QuoteRateDto {
  @ApiProperty({ example: 2.5, description: 'Weight in kg' })
  @IsNumber()
  @IsPositive()
  weightKg: number;

  @ApiPropertyOptional({ example: 7, description: 'Distance in km' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @ApiPropertyOptional({ description: 'Specific rate to use' })
  @IsOptional()
  @IsUUID()
  rateId?: string;

  @ApiPropertyOptional({ description: 'Resolve the active rate for this zone' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;
}
