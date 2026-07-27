import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class AnalyticsRangeDto {
  @ApiPropertyOptional({
    description: 'Start of range (ISO 8601). Defaults to 30 days ago.',
    example: '2026-06-01',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of range (ISO 8601). Defaults to now.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
