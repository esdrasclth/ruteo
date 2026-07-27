import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';

@ApiTags('tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  // Public, no auth: "where is my package?"
  @Get(':trackingNumber')
  track(@Param('trackingNumber') trackingNumber: string) {
    return this.tracking.getPublicTracking(trackingNumber);
  }
}
