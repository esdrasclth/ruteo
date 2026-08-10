import { ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentStatus, ShipmentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class QueryShipmentsDto extends PaginacionDto {
  @ApiPropertyOptional({
    description: 'Busca por tracking, destinatario, teléfono o destino',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional({ enum: ShipmentType })
  @IsOptional()
  @IsEnum(ShipmentType)
  type?: ShipmentType;
}
