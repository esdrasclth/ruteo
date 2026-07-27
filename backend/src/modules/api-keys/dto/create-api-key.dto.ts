import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Integración tienda web' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}
