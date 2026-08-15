import { ApiProperty } from '@nestjs/swagger';
import { ApiScope } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Integración tienda web' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /**
   * Obligatorio y sin valor por defecto a propósito: si crear una llave sin
   * decir para qué diera una llave que sirve para todo, el camino cómodo sería
   * justo el que hay que evitar.
   */
  @ApiProperty({
    enum: ApiScope,
    isArray: true,
    example: [ApiScope.LOCKERS_WRITE, ApiScope.LOCKERS_READ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(ApiScope, { each: true })
  scopes!: ApiScope[];
}
