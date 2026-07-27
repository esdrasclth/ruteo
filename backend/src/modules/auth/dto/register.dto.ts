import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Encomiendas Aviotech' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  tenantName: string;

  @ApiProperty({ example: 'aviotech' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric or hyphen',
  })
  @MinLength(2)
  @MaxLength(40)
  slug: string;

  @ApiProperty({ example: 'owner@aviotech.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Sup3rSecret!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
