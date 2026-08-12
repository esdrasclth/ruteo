import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateManifestDto {
  /** El número que exige Aduanas. Único por empresa. */
  @ApiProperty({ example: 'MANIFEST-HN-2026-0087' })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  number: string;

  /** El vuelo. Opcional: el manifiesto se prepara antes de saber en cuál sale. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tripId?: string;
}
