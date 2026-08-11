import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  /**
   * Opcional, como en el login: el panel de una empresa lo manda —lo saca de su
   * subdominio— y el panel raíz no puede. Sin él, el código se manda a cada
   * empresa donde exista el correo, y cada mensaje dice de cuál es.
   */
  @ApiPropertyOptional({ example: 'encomiendas-catracha' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;

  @ApiProperty({ example: 'admin@catracha.hn' })
  @IsEmail()
  email: string;
}
