import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExceptionSeverity,
  ExceptionStatus,
  ExceptionType,
} from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class QueryExceptionsDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: ExceptionStatus })
  @IsOptional()
  @IsEnum(ExceptionStatus)
  status?: ExceptionStatus;

  @ApiPropertyOptional({ enum: ExceptionType })
  @IsOptional()
  @IsEnum(ExceptionType)
  type?: ExceptionType;

  @ApiPropertyOptional({ enum: ExceptionSeverity })
  @IsOptional()
  @IsEnum(ExceptionSeverity)
  severity?: ExceptionSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  manifestId?: string;
}
