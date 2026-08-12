import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PackageCondition, PackagePhotoType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PreAlertPackageDto } from './pre-alert-package.dto';

export class FotoDeRecepcionDto {
  /** Archivo ya subido y confirmado (`POST /files/confirm`). */
  @ApiProperty({ example: '9f3c0e2a-1b4d-4c5e-8f7a-2b3c4d5e6f70' })
  @IsUUID()
  fileId: string;

  @ApiPropertyOptional({ enum: PackagePhotoType, default: PackagePhotoType.EXTERIOR })
  @IsOptional()
  @IsEnum(PackagePhotoType)
  type?: PackagePhotoType;
}

export class IntakePackageDto extends PreAlertPackageDto {
  @ApiProperty({ description: 'Locker to attach the received package to' })
  @IsUUID()
  lockerId: string;

  // --- Lo que se mide con el bulto delante -----------------------------------
  // Las tres o ninguna: con dos de tres no hay volumen, y asumir la que falta
  // produce un cobro inventado. Ver `pesos.ts`.

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  lengthCm?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  widthCm?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  heightCm?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  pieces?: number;

  /**
   * En qué estado llegó.
   *
   * Se registra siempre, incluso `GOOD`: «no se anotó nada» y «se revisó y
   * estaba bien» son cosas distintas el día que alguien reclama un daño.
   */
  @ApiPropertyOptional({ enum: PackageCondition, default: PackageCondition.GOOD })
  @IsOptional()
  @IsEnum(PackageCondition)
  condition?: PackageCondition;

  // Las fotos NO van aquí, y no es un olvido: para subir un archivo hay que
  // decir a qué cuelga, y en el momento de recibir el bulto todavía no existe.
  // Se adjuntan después, con `POST /lockers/:lockerId/packages/:id/photos`, que
  // además sirve para el caso real de descubrir un daño al día siguiente.
}
