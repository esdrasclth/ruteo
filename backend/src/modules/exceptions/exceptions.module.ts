import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExceptionsController } from './exceptions.controller';
import { ExceptionsService } from './exceptions.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ExceptionsController],
  providers: [ExceptionsService],
  // Lo exporta para el cotejo de manifiestos, que es quien más excepciones crea.
  exports: [ExceptionsService],
})
export class ExceptionsModule {}
