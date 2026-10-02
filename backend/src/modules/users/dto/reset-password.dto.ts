import { ApiProperty } from '@nestjs/swagger';
import { ContrasenaNueva } from '../../auth/contrasenas';

export class ResetPasswordDto {
  @ApiProperty({ example: 'N3wSecret!' })
  @ContrasenaNueva()
  newPassword: string;
}
