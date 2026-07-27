import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PreAlertPackageDto } from './pre-alert-package.dto';

export class IntakePackageDto extends PreAlertPackageDto {
  @ApiProperty({ description: 'Locker to attach the received package to' })
  @IsUUID()
  lockerId: string;
}
