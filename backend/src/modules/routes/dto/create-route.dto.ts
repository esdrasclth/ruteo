import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateRouteDto {
  @ApiProperty({ description: 'Driver assigned to the route' })
  @IsUUID()
  driverId: string;

  @ApiProperty({ example: '2026-07-15' })
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional({
    description: 'Route code; auto-generated when omitted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;
}
