import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  /**
   * Opcional desde que el panel raíz deja entrar solo con correo y contraseña.
   *
   * - **Con slug** (lo manda el panel de una empresa, que lo saca de su
   *   subdominio): entrada directa, se devuelven los tokens.
   * - **Sin slug** (lo manda `panel.…`, que no pertenece a ninguna empresa): se
   *   busca en qué empresas existe el correo y se devuelve un vale de traspaso
   *   por cada una donde la contraseña sea correcta.
   *
   * Que falte no relaja nada: sin slug se comprueba la contraseña contra cada
   * empresa candidata, exactamente igual que con él.
   */
  @ApiPropertyOptional({ example: 'aviotech' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  slug?: string;

  @ApiProperty({ example: 'owner@aviotech.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Sup3rSecret!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
