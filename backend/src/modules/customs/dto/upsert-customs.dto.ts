import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomsCategory, CustomsStatus, ValueSource } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertCustomsDto {
  @ApiProperty({ description: 'Shipment this customs record belongs to' })
  @IsUUID()
  shipmentId: string;

  @ApiPropertyOptional({ example: 250.0, description: 'Declared value (USD)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  declaredValue?: number;

  @ApiPropertyOptional({ example: 0.15, description: 'Duty rate (0-1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  dutyRate?: number;

  @ApiPropertyOptional({ example: 0.15, description: 'Tax/ISV rate (0-1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  taxRate?: number;

  @ApiPropertyOptional({ example: 10.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  handlingFee?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ enum: CustomsStatus })
  @IsOptional()
  @IsEnum(CustomsStatus)
  status?: CustomsStatus;

  @ApiPropertyOptional({ example: 'Requiere factura comercial' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // --- Desglose del valor (fase 3) -------------------------------------------
  // Valor de compra != valor aduanero: el aduanero suma flete y seguro, y es
  // sobre el que se liquida. Las cuatro piezas se guardan para poder rehacer el
  // calculo o discutirlo con el cliente.

  @ApiPropertyOptional({ example: 100.0, description: 'Valor de la mercancia' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  productValue?: number;

  @ApiPropertyOptional({ example: 15.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freightAmount?: number;

  @ApiPropertyOptional({ example: 5.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  insuranceAmount?: number;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  otherCharges?: number;

  @ApiPropertyOptional({ enum: ValueSource })
  @IsOptional()
  @IsEnum(ValueSource)
  valueSource?: ValueSource;

  /**
   * Pais cuyas reglas aplican. Si no viene se toma el destino del envio: es lo
   * correcto en la practica y evita que cada llamada tenga que repetirlo.
   */
  @ApiPropertyOptional({ example: 'HN' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  /**
   * Categoria sugerida. Solo se usa si NO hay regla vigente que decida: cuando
   * la hay, manda la regla. Dejar que quien llama fije la categoria por encima
   * de la norma seria dejar que elija su propia tarifa.
   */
  @ApiPropertyOptional({ enum: CustomsCategory })
  @IsOptional()
  @IsEnum(CustomsCategory)
  category?: CustomsCategory;
}
