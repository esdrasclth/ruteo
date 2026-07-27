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
  @IsUrl({ require_tld: false })
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
