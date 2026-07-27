import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional } from 'class-validator';

export class OptimizeRouteDto {
  @ApiPropertyOptional({
    example: 14.065,
    description: 'Start latitude; defaults to the driver zone center',
  })
  @IsOptional()
  @IsLatitude()
  startLat?: number;

  @ApiPropertyOptional({ example: -87.1715 })
  @IsOptional()
  @IsLongitude()
  startLng?: number;
}
