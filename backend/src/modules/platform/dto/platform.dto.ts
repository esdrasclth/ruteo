import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Plan, TenantModule, TenantStatus, UserStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PlatformLoginDto {
  @ApiProperty({ example: 'admin@brandsofts.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CambiarPlanDto {
  @ApiProperty({ enum: Plan })
  @IsEnum(Plan)
  plan: Plan;
}

export class CambiarEstadoTenantDto {
  @ApiProperty({ enum: TenantStatus })
  @IsEnum(TenantStatus)
  status: TenantStatus;

  @ApiPropertyOptional({ description: 'Obligatorio al suspender o cancelar' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/**
 * Borrado definitivo de una empresa.
 *
 * Pide escribir el identificador a mano, y no es burocracia: el borrado se
 * lanza desde una lista de empresas parecidas, es irreversible y se lleva por
 * delante envíos, pagos, evidencia y usuarios. Un botón con un «¿seguro?» se
 * confirma por reflejo; escribir `mensajeria-lopez` no se teclea sin mirar cuál
 * está abierta.
 */
export class BorrarTenantDto {
  @ApiProperty({
    description:
      'El identificador exacto de la empresa. Si no coincide, no se borra.',
    example: 'mensajeria-lopez',
  })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({
    description:
      'Por qué se borra. Queda en el registro de plataforma, que sobrevive a la empresa.',
    example: 'Baja solicitada por el cliente el 2026-08-14',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, {
    message:
      'Explica el motivo: es lo único que quedará para saber por qué desapareció esta empresa.',
  })
  reason: string;
}

export class CambiarModuloDto {
  @ApiProperty({ enum: TenantModule })
  @IsEnum(TenantModule)
  module: TenantModule;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CambiarEstadoAdminDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;
}
