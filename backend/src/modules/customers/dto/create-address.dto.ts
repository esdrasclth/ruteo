import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Una dirección del cliente, escrita una vez y reutilizada.
 *
 * Los campos son los de Honduras —departamento, municipio, colonia— y no un
 * `addressLine` genérico: es como se dicen aquí las direcciones y es lo que
 * permite agrupar por zona. En una sola línea de texto no se puede contar
 * cuánto se entrega en cada municipio, que es media razón de tenerla aparte.
 */
export class CreateAddressDto {
  @ApiProperty({ example: 'Casa' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;

  @ApiProperty({ example: 'Francisco Morazán' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  department: string;

  @ApiProperty({ example: 'Tegucigalpa' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  municipality: string;

  @ApiPropertyOptional({ example: 'Col. Palmira' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'Calle Principal, casa 1425' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  /**
   * En media Honduras esto es lo único que lleva al repartidor a la puerta.
   * Por eso es un campo propio y no una nota que se pierde entre otras.
   */
  @ApiPropertyOptional({
    example: 'Portón negro frente a la pulpería La Bendición',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reference?: string;

  /** Quien recibe en ESTA dirección, cuando no es el cliente. */
  @ApiPropertyOptional({ example: 'Recepción' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  recipientName?: string;

  @ApiPropertyOptional({ example: '+504 9999-9999' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  recipientPhone?: string;

  @ApiPropertyOptional({ example: 14.0932 })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -87.1876 })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({
    description: 'La que se propone al crear un envío. Sólo una por cliente.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
