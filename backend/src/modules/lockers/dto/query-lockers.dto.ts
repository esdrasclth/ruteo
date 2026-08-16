import { ApiPropertyOptional } from '@nestjs/swagger';
import { LockerStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Filtros del listado de casilleros.
 *
 * **No lleva `PaginacionDto` a propósito.** `GET /lockers` es de los endpoints
 * abiertos a llaves de API (`@Alcances(LOCKERS_READ)`), y cambiar su respuesta
 * de array a `{items,total,…}` rompería las integraciones que ya lo consumen.
 * Lo que sí necesitaba es no ser infinito y poder buscar: con `search` el
 * desplegable de la pantalla de Recepción pregunta al servidor en vez de
 * descargarse todos los casilleros para filtrarlos en el navegador.
 */
export class QueryLockersDto {
  @ApiPropertyOptional({
    description: 'Busca por código, nombre, correo o teléfono del cliente',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: LockerStatus })
  @IsOptional()
  @IsEnum(LockerStatus)
  status?: LockerStatus;
}
