import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnDestination, ReturnReason, ReturnStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class QueryReturnsDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: ReturnStatus })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @ApiPropertyOptional({ enum: ReturnDestination })
  @IsOptional()
  @IsEnum(ReturnDestination)
  destination?: ReturnDestination;

  @ApiPropertyOptional({ enum: ReturnReason })
  @IsOptional()
  @IsEnum(ReturnReason)
  reason?: ReturnReason;
}
