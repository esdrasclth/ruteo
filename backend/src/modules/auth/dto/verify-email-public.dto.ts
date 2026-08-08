import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailPublicDto {
  @ApiProperty({ example: 'encomiendas-catracha' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ example: 'admin@catracha.hn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
