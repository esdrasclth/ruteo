import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AddClaimFileDto {
  /** Archivo ya subido y confirmado (`POST /files/confirm`). */
  @ApiProperty({ example: '9f3c0e2a-1b4d-4c5e-8f7a-2b3c4d5e6f70' })
  @IsUUID()
  fileId!: string;

  /**
   * Quién aportó la evidencia.
   *
   * Importa más de lo que parece: la misma foto de una caja rota significa lo
   * contrario según venga del cliente —«así me llegó»— o de la bodega —«así
   * salió de aquí»—. Sin este campo, resolver un reclamo mirando la galería es
   * imposible.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  fromCustomer?: boolean;

  @ApiPropertyOptional({ example: 'Foto enviada por WhatsApp el 14/08' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
