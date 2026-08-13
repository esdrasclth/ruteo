import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChargeConcept, ChargeKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateChargeDto {
  @ApiProperty()
  @IsUUID()
  shipmentId: string;

  @ApiProperty({ enum: ChargeConcept })
  @IsEnum(ChargeConcept)
  concept: ChargeConcept;

  /**
   * De quién es el dinero.
   *
   * Opcional porque cada concepto tiene una naturaleza habitual, pero se puede
   * mandar: hay couriers que absorben el manejo y otros que lo trasladan, y ese
   * segundo caso sería imposible si la naturaleza se dedujera del concepto.
   */
  @ApiPropertyOptional({ enum: ChargeKind })
  @IsOptional()
  @IsEnum(ChargeKind)
  kind?: ChargeKind;

  // Un cargo de cero no es un cargo: es la ausencia de uno. Se rechaza en vez de
  // guardarse para que la tabla no se llene de filas que nadie va a cobrar.
  @ApiProperty({ example: 25.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: 'Reempaque de caja rota en Miami' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AnularCargoDto {
  /**
   * Por qué se anula.
   *
   * Se exige por lo mismo que cerrar una excepción exige explicar cómo se
   * resolvió: un cargo anulado sin motivo no distingue el error de digitación
   * de la cortesía comercial, y son cosas muy distintas cuando alguien revisa
   * por qué el mes cerró más bajo.
   */
  @ApiProperty({ example: 'Se cobró dos veces el manejo' })
  @IsString()
  @MaxLength(500)
  motivo: string;
}
