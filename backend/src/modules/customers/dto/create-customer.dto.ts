import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'juan@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+504 9999-9999' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: '0801-1990-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentId?: string;

  @ApiPropertyOptional({ example: 'Cliente frecuente' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
