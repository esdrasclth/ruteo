import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, PaymentType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

// Los filtros venían como `@Query('x')` sueltos y sin validar. En un DTO
// además se comprueban: `driverId` y `shipmentId` van derechos a un `where` de
// Prisma, y exigir que sean UUID descarta la basura antes de llegar a la base.
export class QueryPaymentsDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentType })
  @IsOptional()
  @IsEnum(PaymentType)
  type?: PaymentType;

  @ApiPropertyOptional({ description: 'Repartidor que cobró' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Envío al que pertenece el cobro' })
  @IsOptional()
  @IsUUID()
  shipmentId?: string;
}
