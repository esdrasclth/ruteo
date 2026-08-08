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
