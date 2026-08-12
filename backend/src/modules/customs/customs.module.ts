import { Module } from '@nestjs/common';
import { CustomsController } from './customs.controller';
import { CustomsService } from './customs.service';
import { CustomsDocsService } from './customs-docs.service';

@Module({
  controllers: [CustomsController],
  providers: [CustomsService, CustomsDocsService],
  exports: [CustomsService, CustomsDocsService],
})
export class CustomsModule {}
