import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExceptionSeverity,
  ExceptionStatus,
  ExceptionType,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateExceptionDto {
  @ApiProperty({ enum: ExceptionType })
  @IsEnum(ExceptionType)
  type: ExceptionType;

  @ApiPropertyOptional({ enum: ExceptionSeverity })
  @IsOptional()
  @IsEnum(ExceptionSeverity)
  severity?: ExceptionSeverity;

  @ApiProperty({ example: 'Llegó un bulto sin etiqueta legible' })
  @IsString()
  @MaxLength(500)
  description: string;

  // Los tres son opcionales y lo normal es que venga uno. No se exige ninguno
  // porque una excepción puede nacer sin dueño conocido —«hay una caja sin
  // etiqueta»— y obligar a inventarle un envío para poder registrarla sería
  // peor que dejarla suelta hasta que se sepa de quién es.
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  packageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  manifestId?: string;

  @ApiPropertyOptional({ example: '3 bultos / 15 kg' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  expectedValue?: string;

  @ApiPropertyOptional({ example: '2 bultos / 10 kg' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  actualValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;
}

export class UpdateExceptionDto {
  @ApiPropertyOptional({ enum: ExceptionStatus })
  @IsOptional()
  @IsEnum(ExceptionStatus)
  status?: ExceptionStatus;

  @ApiPropertyOptional({ enum: ExceptionSeverity })
  @IsOptional()
  @IsEnum(ExceptionSeverity)
  severity?: ExceptionSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  /**
   * Qué se hizo. Se exige al cerrar —ver `ExceptionsService.update`—: una
   * excepción cerrada sin explicación no distingue «se resolvió» de «alguien se
   * cansó de verla en la lista».
   */
  @ApiPropertyOptional({ example: 'El transportista confirmó reembolso' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolution?: string;
}
