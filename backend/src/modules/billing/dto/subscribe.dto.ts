import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Plan } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ enum: Plan })
  @IsEnum(Plan)
  plan!: Plan;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    description:
      'Cancel at the end of the current period instead of immediately',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  atPeriodEnd?: boolean;
}
