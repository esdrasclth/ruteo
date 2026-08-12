import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PackagePhotoType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * Adjunta una foto ya subida a un bulto.
 *
 * Es un paso aparte de la recepción porque el archivo se sube contra el bulto, y
 * al recibir el bulto todavía no existe. Y porque el caso real no es solo
 * fotografiar al recibir: los daños se descubren al día siguiente, cuando
 * alguien mueve la caja.
 */
export class AddPackagePhotoDto {
  /** Archivo ya subido y confirmado (`POST /files/confirm`). */
  @ApiProperty({ example: '9f3c0e2a-1b4d-4c5e-8f7a-2b3c4d5e6f70' })
  @IsUUID()
  fileId: string;

  @ApiPropertyOptional({
    enum: PackagePhotoType,
    default: PackagePhotoType.EXTERIOR,
  })
  @IsOptional()
  @IsEnum(PackagePhotoType)
  type?: PackagePhotoType;
}
