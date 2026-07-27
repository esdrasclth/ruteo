import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, RouteStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AddStopDto } from './dto/add-stop.dto';
import { CompleteStopDto } from './dto/complete-stop.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { FailStopDto } from './dto/fail-stop.dto';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { UpdateRouteStatusDto } from './dto/update-route-status.dto';
import { RoutesService } from './routes.service';

@ApiTags('routes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRouteDto) {
    return this.routes.create(user.tenantId, dto);
  }

  @Get()
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'status', enum: RouteStatus, required: false })
  list(
    @CurrentUser() user: AuthUser,
    @Query('driverId') driverId?: string,
    @Query('status') status?: RouteStatus,
  ) {
    return this.routes.list(user.tenantId, driverId, status);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routes.findOne(user.tenantId, id);
  }

  @Patch(':id/status')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteStatusDto,
  ) {
    return this.routes.updateStatus(user.tenantId, id, dto);
  }

  @Post(':id/stops')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  addStop(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStopDto,
  ) {
    return this.routes.addStop(user.tenantId, id, dto);
  }

  @Post(':id/optimize')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  optimize(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptimizeRouteDto,
  ) {
    return this.routes.optimize(user.tenantId, id, dto);
  }

  @Patch(':id/stops/:stopId/arrive')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  arriveStop(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.routes.arriveStop(user.tenantId, id, stopId);
  }

  @Post(':id/stops/:stopId/complete')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  completeStop(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() dto: CompleteStopDto,
  ) {
    return this.routes.completeStop(user, id, stopId, dto);
  }

  @Post(':id/stops/:stopId/fail')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.DRIVER)
  failStop(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() dto: FailStopDto,
  ) {
    return this.routes.failStop(user, id, stopId, dto);
  }
}
