import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateWebhookDto {
  @ApiPropertyOptional({ example: 'https://tienda.example.com/hooks/ruteo' })
  @IsOptional()
  // Mismo criterio que en el alta: aquí solo la forma, la política en
  // `destino-seguro.ts`.
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional({ example: ['shipment.status_changed'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
