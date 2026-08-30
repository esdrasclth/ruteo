import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class QueryCustomersDto extends PaginacionDto {
  @ApiPropertyOptional({
    description: 'Search by name, email, phone or document',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}
