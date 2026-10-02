import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { ContrasenaNueva } from '../../auth/contrasenas';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Sup3rSecret!' })
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ example: 'N3wSecret!' })
  @ContrasenaNueva()
  newPassword: string;
}
