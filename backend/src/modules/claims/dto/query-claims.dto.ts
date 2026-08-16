import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClaimStatus, ClaimType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class QueryClaimsDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: ClaimStatus })
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;

  @ApiPropertyOptional({ enum: ClaimType })
  @IsOptional()
  @IsEnum(ClaimType)
  type?: ClaimType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
