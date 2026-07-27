import { Module } from '@nestjs/common';
import { ShipmentsModule } from '../shipments/shipments.module';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  imports: [ShipmentsModule],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
