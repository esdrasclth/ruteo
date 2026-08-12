import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Datos de contacto y fiscales de la empresa.
 *
 * Todo opcional: la pantalla guarda lo que haya y no obliga a rellenarlo de una
 * sentada. Quien los exige es `BillingService` al contratar un plan de pago, que
 * es cuando de verdad hacen falta.
 *
 * Ojo con lo que NO va aquí: el CAI, el rango de correlativos y la fecha límite
 * de emisión que pide el SAR son para que la EMPRESA facture a SUS clientes, no
 * para que Ruteo le facture a ella. Son datos que caducan y necesitan su propia
 * pantalla con avisos de vencimiento; meterlos en este formulario los condena a
 * quedarse obsoletos sin que nadie se entere.
 */
export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Encomiendas Aviotech' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: '+504 9999-8888' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s()-]{8,20}$/, { message: 'El teléfono no parece válido.' })
  phone?: string;

  @ApiPropertyOptional({
    example: 'Encomiendas Aviotech S. de R.L.',
    description: 'Nombre legal, que puede no ser el comercial.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  legalName?: string;

  // El RTN hondureño son 14 dígitos. Se guardan SOLO los dígitos: la gente lo
  // escribe con guiones, con espacios o pegado, y si se guarda tal cual, dos
  // empresas con el mismo RTN parecen distintas y ninguna búsqueda cuadra.
  @ApiPropertyOptional({ example: '08019995123456' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : (value as unknown),
  )
  @IsString()
  @Matches(/^\d{14}$/, { message: 'El RTN debe tener 14 dígitos.' })
  taxId?: string;

  @ApiPropertyOptional({ example: 'facturacion@aviotech.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo de facturación no es válido.' })
  billingEmail?: string;

  @ApiPropertyOptional({ example: 'Col. Palmira, Tegucigalpa, Honduras' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  billingAddress?: string;
}
