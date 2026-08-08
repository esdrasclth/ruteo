import { TenantModule } from '@prisma/client';
import { Modulo } from '../../common/decorators/modulo.decorator';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateRateDto } from './dto/create-rate.dto';
import { QuoteRateDto } from './dto/quote-rate.dto';
import { UpdateRateDto } from './dto/update-rate.dto';
import { RatesService } from './rates.service';

@ApiTags('rates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('rates')
@Modulo(TenantModule.PRICING)
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRateDto) {
    return this.rates.create(user.tenantId, dto);
  }

  // Quote is open to merchants too (cotizador de envíos).
  @Post('quote')
  quote(@CurrentUser() user: AuthUser, @Body() dto: QuoteRateDto) {
    return this.rates.quote(user.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.rates.list(user.tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rates.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRateDto,
  ) {
    return this.rates.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rates.remove(user.tenantId, id);
  }
}
