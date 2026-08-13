import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Una nota a mano en el historial del envío.
 *
 * Es la válvula de escape del sistema de eventos tipados: lo que pasa de verdad
 * y no encaja en ningún tipo —«el destinatario pidió entregarlo el lunes»— acaba
 * escrito en algún sitio, y mejor aquí, donde queda con fecha y con autor, que
 * en un WhatsApp que se pierde.
 */
export class AddNoteDto {
  @ApiProperty({ example: 'El destinatario pide entregar después del lunes' })
  @IsString()
  @MaxLength(1000)
  description: string;

  /**
   * Si el cliente debe verla en su rastreo.
   *
   * Por defecto no: una nota se escribe pensando en el compañero del turno
   * siguiente, y publicar por descuido no se puede deshacer —el cliente ya la
   * leyó—.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  publica?: boolean;
}
