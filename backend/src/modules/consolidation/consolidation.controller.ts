import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TenantModule } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { ConsolidationService } from './consolidation.service';
import { ConsolidateDto } from './dto/consolidate.dto';

@ApiTags('consolidation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('consolidation')
// Consolidar es agrupar paquetes RECIBIDOS EN UN CASILLERO en un solo envío
// internacional: sin el módulo de casilleros no hay nada que consolidar. Se
// quedó fuera del catálogo y quedaba disponible hasta en el plan FREE, que no
// incluye casilleros.
@Modulo(TenantModule.LOCKERS)
export class ConsolidationController {
  constructor(private readonly consolidation: ConsolidationService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  consolidate(@CurrentUser() user: AuthUser, @Body() dto: ConsolidateDto) {
    return this.consolidation.consolidate(user, dto);
  }
}
