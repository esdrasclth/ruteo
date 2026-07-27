import { ApiPropertyOptional } from '@nestjs/swagger';
import { PackageStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryPackagesDto {
  @ApiPropertyOptional({
    description: 'Matches tracking, merchant, description, locker code or customer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: PackageStatus })
  @IsOptional()
  @IsEnum(PackageStatus)
  status?: PackageStatus;
}
