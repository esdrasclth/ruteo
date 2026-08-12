import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpdateManifestDto {
  /**
   * A qué vuelo va este manifiesto. `null` lo desengancha.
   *
   * `ValidateIf` en vez de `IsOptional` a secas: `IsOptional` trata `null` como
   * «no vino» y lo descarta, así que desenganchar un vuelo sería imposible —el
   * campo llegaría y se ignoraría en silencio—.
   */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsUUID()
  tripId?: string | null;
}
