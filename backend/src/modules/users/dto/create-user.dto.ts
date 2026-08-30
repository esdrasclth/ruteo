import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

// Sin contraseña a propósito: la elige el invitado desde el correo. Que el
// administrador la ponga significaba que conocía la clave de sus empleados, lo
// que arruina el no-repudio —si un operador cancela un envío, no se puede
// sostener que fue él— y garantiza que la primera contraseña se comparta por
// WhatsApp.
export class CreateUserDto {
  @ApiProperty({ example: 'operador@aviotech.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'María López' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ enum: Role, example: Role.OPERATOR })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ description: 'Link this user to an existing driver' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({
    description: 'Link this user to an existing customer',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
