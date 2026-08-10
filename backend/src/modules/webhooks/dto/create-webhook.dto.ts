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
  // Aquí solo se comprueba la FORMA. La política —https obligatorio, puertos de
  // web, nada de direcciones internas— vive entera en `destino-seguro.ts`, que
  // además la reevalúa antes de cada entrega y respeta
  // `WEBHOOKS_PERMITIR_DESTINOS_PRIVADOS`.
  //
  // Exigir `https` y TLD también aquí parecía defensa en profundidad, pero
  // dejaba la política escrita en dos sitios y solo uno conocía la bandera de
  // desarrollo: el DTO rechazaba `http://127.0.0.1` antes de que nadie mirara
  // la bandera, así que la vía de escape documentada en `.env.example` no
  // funcionaba y los e2e de entrega no podían pasar. Además el mensaje de error
  // era peor: "url must be a URL address" en vez de explicar que hace falta
  // https.
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
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
