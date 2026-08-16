import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Adjunta un archivo ya subido a una excepción.
 *
 * Lo dejó pendiente la fase 2: una diferencia del cotejo se registraba con sus
 * cifras —«se esperaban 100 bultos, llegaron 98»— pero sin poder colgarle la
 * foto del pallet abierto. Un mes después, esa cifra sola no le sirve a nadie
 * para reclamarle al transportista.
 */
export class AddExceptionFileDto {
  /** Archivo ya subido y confirmado (`POST /files/confirm`). */
  @ApiProperty({ example: '9f3c0e2a-1b4d-4c5e-8f7a-2b3c4d5e6f70' })
  @IsUUID()
  fileId!: string;

  @ApiPropertyOptional({ example: 'Pallet 3, esquina rota' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
