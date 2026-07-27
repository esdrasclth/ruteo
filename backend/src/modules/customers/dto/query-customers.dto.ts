import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryCustomersDto {
  @ApiPropertyOptional({ description: 'Search by name, email, phone or document' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}
