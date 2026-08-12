import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class LineaContadaDto {
  @ApiProperty()
  @IsUUID()
  shipmentId: string;

  /** Cero es un valor válido y significativo: la guía no llegó. */
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  receivedPieces: number;

  @ApiPropertyOptional({ example: 10.5 })
  @IsOptional()
  // A `Decimal` desde el borde: el cotejo compara pesos, y comparar con
  // `number` arrastra el error de coma flotante justo donde se decide si falta
  // media caja.
  @Transform(({ value }) =>
    value === undefined || value === null
      ? undefined
      : new Prisma.Decimal(value as string | number),
  )
  receivedWeightKg?: Prisma.Decimal;
}

export class ReconcileManifestDto {
  @ApiProperty({ type: [LineaContadaDto] })
  @IsArray()
  // Tope alto pero existente: un manifiesto real trae cientos de guías, y sin
  // límite esto acepta un cuerpo de cualquier tamaño.
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => LineaContadaDto)
  items: LineaContadaDto[];
}
