import { ApiProperty } from '@nestjs/swagger';
import { RouteStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateRouteStatusDto {
  @ApiProperty({ enum: RouteStatus })
  @IsEnum(RouteStatus)
  status: RouteStatus;
}
