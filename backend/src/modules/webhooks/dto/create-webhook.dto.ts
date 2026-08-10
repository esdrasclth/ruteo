import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://tienda.example.com/hooks/ruteo' })
  // `require_tld: false` permitía `http://localhost` y `http://169.254.169.254`
  // explícitamente. El filtro de verdad está en `destino-seguro.ts` (resuelve
  // el DNS y descarta rangos internos); esto es el primer corte barato.
  @IsUrl({ protocols: ['https'], require_tld: true, require_protocol: true })
  @MaxLength(500)
  url!: string;

  @ApiProperty({
    example: ['shipment.status_changed'],
    description: 'Event names this endpoint subscribes to',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events!: string[];
}
