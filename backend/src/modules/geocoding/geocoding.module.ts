import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

// RedisService es global (RedisModule @Global), así que no hace falta importarlo.
@Module({
  controllers: [GeocodingController],
  providers: [GeocodingService, RateLimitGuard],
  exports: [GeocodingService],
})
export class GeocodingModule {}
