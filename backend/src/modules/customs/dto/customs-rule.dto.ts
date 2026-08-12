import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomsCategory, DocumentType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCustomsRuleDto {
  @ApiProperty({ example: 'HN' })
  @IsString()
  @MaxLength(2)
  country: string;

  @ApiProperty({ enum: CustomsCategory })
  @IsEnum(CustomsCategory)
  category: CustomsCategory;

  /** Tope de valor aduanero. Sin él, la regla es el cajón de sastre. */
  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxValue?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresInvoice?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresPermit?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresBroker?: boolean;

  /** Fracción, no porcentaje: 0.15 es el 15 %. */
  @ApiProperty({ example: 0.15 })
  @IsNumber()
  @Min(0)
  @Max(1)
  dutyRate: number;

  @ApiProperty({ example: 0.15 })
  @IsNumber()
  @Min(0)
  @Max(1)
  taxRate: number;

  /**
   * Desde cuándo rige. Si no viene, desde ahora.
   *
   * Se puede fechar en el futuro a propósito: una norma que se publica hoy y
   * entra en vigor el mes que viene se carga cuando se conoce, no el día que
   * empieza, que es cuando nadie se acuerda.
   */
  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class CerrarReglaDto {
  /**
   * Desde cuándo deja de regir. Cerrar una regla es ponerle fecha, NO borrarla:
   * una liquidación de hace un año tiene que seguir pudiendo explicarse con la
   * regla que se le aplicó.
   */
  @ApiProperty({ example: '2026-09-01T00:00:00Z' })
  @IsDateString()
  effectiveTo: string;
}

export class AddDocumentDto {
  /** Archivo ya subido y confirmado (`POST /files/confirm`). */
  @ApiProperty()
  @IsUUID()
  fileId: string;

  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
