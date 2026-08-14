import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryMode, ShipmentType } from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateShipmentDto {
  @ApiProperty({ enum: ShipmentType })
  @IsEnum(ShipmentType)
  type: ShipmentType;

  @ApiPropertyOptional({ description: 'Link this shipment to a customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /**
   * Cómo se entrega. Se elige aquí, al crear el envío, y no al descargarlo: es
   * lo que decide en qué montón va el bulto cuando llega a la bodega de
   * destino, así que saberlo con la caja ya en la mano obliga a volver a
   * tocarla.
   */
  @ApiPropertyOptional({ enum: DeliveryMode, default: DeliveryMode.HOME })
  @IsOptional()
  @IsEnum(DeliveryMode)
  deliveryMode?: DeliveryMode;

  /** La sucursal donde lo retira el cliente. Obligatoria si el modo es BRANCH. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deliveryWarehouseId?: string;

  /**
   * Dirección reutilizable del cliente de la que sale el destino.
   *
   * Lo que se guarda en el envío sigue siendo una COPIA de sus campos: corregir
   * la colonia del cliente el año que viene no puede reescribir a dónde se
   * entregó este envío.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  destinationAddressId?: string;

  @ApiProperty({ example: 'Maria Lopez' })
  @IsString()
  @MaxLength(120)
  recipientName: string;

  @ApiPropertyOptional({ example: '+50499998888' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  recipientPhone?: string;

  @ApiPropertyOptional({ example: 'Miami warehouse, FL' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  originLabel?: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  originCountry?: string;

  @ApiPropertyOptional({ example: 'Tegucigalpa, HN' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  destinationLabel?: string;

  @ApiPropertyOptional({ example: 'HN' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  destinationCountry?: string;

  @ApiPropertyOptional({ example: 14.0723 })
  @IsOptional()
  @IsLatitude()
  destinationLat?: number;

  @ApiPropertyOptional({ example: -87.1921 })
  @IsOptional()
  @IsLongitude()
  destinationLng?: number;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number;

  @ApiPropertyOptional({ example: 120.0 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  declaredValue?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  codAmount?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
