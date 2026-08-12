import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Una guía hija.
 *
 * Casi todo es opcional porque se COPIA del envío cuando no viene: peso,
 * consignatario, valor FOB y moneda salen de ahí. Lo que se manda explícito es
 * lo que difiere del envío, que en la práctica es el número de bultos.
 */
export class AddManifestItemDto {
  @ApiProperty()
  @IsUUID()
  shipmentId: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  pieces?: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number;

  @ApiPropertyOptional({ example: 'Ropa y calzado' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 'María Rodríguez' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  consignee?: string;

  @ApiPropertyOptional({ example: 25.0 })
  @IsOptional()
  @IsNumber()
  freightAmount?: number;

  @ApiPropertyOptional({ example: 120.0 })
  @IsOptional()
  @IsNumber()
  fobValue?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
