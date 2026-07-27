import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

// Proof of delivery captured when a stop is completed.
export class CompleteStopDto {
  @ApiPropertyOptional({ example: 'María López' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  receivedBy?: string;

  @ApiPropertyOptional({ example: 'https://cdn.ruteo.app/pod/sig-123.png' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  signatureUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.ruteo.app/pod/photo-123.jpg' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  photoUrl?: string;

  @ApiPropertyOptional({ example: 14.0932 })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -87.1876 })
  @IsOptional()
  @IsLongitude()
  lng?: number;
}
