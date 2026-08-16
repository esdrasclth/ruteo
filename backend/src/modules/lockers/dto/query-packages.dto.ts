import { ApiPropertyOptional } from '@nestjs/swagger';
import { PackageStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class QueryPackagesDto extends PaginacionDto {
  @ApiPropertyOptional({
    description: 'Matches tracking, merchant, description, locker code or customer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: PackageStatus })
  @IsOptional()
  @IsEnum(PackageStatus)
  status?: PackageStatus;
}
