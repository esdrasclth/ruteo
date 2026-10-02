import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ContrasenaNueva } from '../contrasenas';

export class ResetPasswordCodeDto {
  @ApiProperty({ example: 'encomiendas-catracha' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ example: 'admin@catracha.hn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '482913', description: 'Código recibido por correo' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ minLength: 8 })
  @ContrasenaNueva()
  newPassword: string;
}
