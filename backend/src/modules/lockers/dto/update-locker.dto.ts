import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { LockerStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateLockerDto } from './create-locker.dto';

export class UpdateLockerDto extends PartialType(CreateLockerDto) {
  @ApiPropertyOptional({ enum: LockerStatus })
  @IsOptional()
  @IsEnum(LockerStatus)
  status?: LockerStatus;
}
