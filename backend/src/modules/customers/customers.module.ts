import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { DireccionesService } from './direcciones.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, DireccionesService],
  exports: [CustomersService, DireccionesService],
})
export class CustomersModule {}
