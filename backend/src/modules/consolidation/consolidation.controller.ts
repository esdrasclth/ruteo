import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ConsolidationService } from './consolidation.service';
import { ConsolidateDto } from './dto/consolidate.dto';

@ApiTags('consolidation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consolidation')
export class ConsolidationController {
  constructor(private readonly consolidation: ConsolidationService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  consolidate(@CurrentUser() user: AuthUser, @Body() dto: ConsolidateDto) {
    return this.consolidation.consolidate(user, dto);
  }
}
