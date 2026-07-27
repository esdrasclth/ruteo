import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DriverStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateDriverDto } from './create-driver.dto';

export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  @ApiPropertyOptional({ enum: DriverStatus })
  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;
}
