import { ApiPropertyOptional } from '@nestjs/swagger';
import { ChargeConcept, ChargeKind, ChargeStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class QueryChargesDto extends PaginacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @ApiPropertyOptional({ enum: ChargeStatus })
  @IsOptional()
  @IsEnum(ChargeStatus)
  status?: ChargeStatus;

  @ApiPropertyOptional({ enum: ChargeKind })
  @IsOptional()
  @IsEnum(ChargeKind)
  kind?: ChargeKind;

  @ApiPropertyOptional({ enum: ChargeConcept })
  @IsOptional()
  @IsEnum(ChargeConcept)
  concept?: ChargeConcept;
}

/**
 * Rango del resumen. Por defecto, los últimos 30 días.
 *
 * Mismo criterio que `analytics`: sin rango, el resumen del cierre de mes
 * mezclaría el mes en curso con toda la historia de la empresa.
 */
export class RangoCargosDto {
  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
