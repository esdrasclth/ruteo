import { ApiPropertyOptional } from '@nestjs/swagger';
import { ManifestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class QueryManifestsDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: ManifestStatus })
  @IsOptional()
  @IsEnum(ManifestStatus)
  status?: ManifestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tripId?: string;
}
