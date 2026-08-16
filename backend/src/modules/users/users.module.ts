import { Module } from '@nestjs/common';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { ZitadelService } from '../auth/zitadel/zitadel.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // `FilesModule` para reutilizar la confirmacion de subida: comprobar que el
  // objeto llego de verdad y crear su fila ya esta escrito ahi, y duplicarlo
  // aqui seria tener dos sitios donde se decide si un archivo existe.
  // `StorageModule` es global, asi que no hace falta importarlo.
  imports: [AuditModule, AuthModule, FilesModule],
  controllers: [UsersController],
  providers: [UsersService, ZitadelService, VerifiedEmailGuard],
  exports: [UsersService],
})
export class UsersModule {}
