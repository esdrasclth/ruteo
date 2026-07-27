import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({ example: '+50499998888' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  recipient!: string;

  @ApiProperty({ example: 'shipment.update' })
  @IsString()
  @MaxLength(80)
  type!: string;

  @ApiPropertyOptional({ example: 'Tu paquete va en camino' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiProperty({ example: 'El envío RUT-XXXX está en reparto.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;

  @ApiPropertyOptional({ description: 'Related shipment id' })
  @IsOptional()
  @IsUUID()
  shipmentId?: string;
}
