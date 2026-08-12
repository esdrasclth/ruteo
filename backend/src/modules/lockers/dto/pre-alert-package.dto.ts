import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PackageCategory } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class PreAlertPackageDto {
  @ApiPropertyOptional({
    example: '1Z999AA10123456784',
    description: 'Carrier tracking number of the incoming package',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalTracking?: string;

  @ApiPropertyOptional({ example: 'Amazon' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant?: string;

  @ApiPropertyOptional({ example: 'Auriculares Bluetooth' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number;

  @ApiPropertyOptional({ example: 79.99 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  declaredValue?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  // --- Lo que el cliente sabe y la bodega no puede adivinar -------------------
  // Un paquete que llega con la etiqueta rota o ilegible solo se puede casar por
  // estos datos. Sin ellos acaba en el montón de «sin dueño», que es donde se
  // pierden los paquetes de verdad.

  @ApiPropertyOptional({ example: 'Amazon' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  storeName?: string;

  @ApiPropertyOptional({ example: '114-1234567-1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderNumber?: string;

  /** Cuándo dice el comercio que llega. Permite avisar de un retraso. */
  @ApiPropertyOptional({ example: '2026-08-20' })
  @IsOptional()
  @IsDateString()
  estimatedArrival?: string;

  @ApiPropertyOptional({ enum: PackageCategory, example: PackageCategory.ELECTRONICS })
  @IsOptional()
  @IsEnum(PackageCategory)
  category?: PackageCategory;

  /**
   * Factura de compra, ya subida y confirmada (`POST /files/confirm`).
   *
   * Se pide en la PREALERTA y no al recibir porque el cliente la tiene el día
   * que compra. Pedírsela cuando el paquete ya está en aduana es pedírsela justo
   * cuando el trámite está parado esperándola.
   */
  @ApiPropertyOptional({ example: '9f3c0e2a-1b4d-4c5e-8f7a-2b3c4d5e6f70' })
  @IsOptional()
  @IsUUID()
  invoiceFileId?: string;
}
