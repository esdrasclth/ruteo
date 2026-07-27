import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateLockerDto {
  @ApiPropertyOptional({
    description: 'Locker code; auto-generated when omitted',
    example: 'BOX-7K2P9Q',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional({
    description: 'Link to an existing customer; created from contact when omitted',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MaxLength(160)
  customerName: string;

  @ApiPropertyOptional({ example: 'juan@example.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ example: '+504 9999-9999' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiProperty({ example: '8001 NW 25th St' })
  @IsString()
  @MaxLength(160)
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Suite BOX-7K2P9Q' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine2?: string;

  @ApiProperty({ example: 'Miami' })
  @IsString()
  @MaxLength(80)
  city: string;

  @ApiProperty({ example: 'FL' })
  @IsString()
  @MaxLength(40)
  state: string;

  @ApiProperty({ example: '33122' })
  @IsString()
  @MaxLength(20)
  postalCode: string;

  @ApiPropertyOptional({ example: 'US', default: 'US' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}
