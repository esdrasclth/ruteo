import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({ example: 'encomiendas-catracha' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ example: 'operador@catracha.hn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ minLength: 8, description: 'La elige el invitado' })
  @IsString()
  @MinLength(8)
  password: string;
}
