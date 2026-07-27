import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Sup3rSecret!' })
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ example: 'N3wSecret!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
