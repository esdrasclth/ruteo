import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface RoadRoute {
  /** [lng, lat][] — geometría real por calles, lista para pintar. */
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
}

interface OsrmResponse {
  code?: string;
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
  }[];
}

// La red de carreteras cambia poco y el resultado depende solo de las
// coordenadas: una semana de caché es conservador.
const TTL_CACHE = 60 * 60 * 24 * 7;

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  // Geometría por carretera de las paradas de una ruta, en su orden actual.
  // Devuelve null cuando no se puede calcular (menos de dos paradas con
  // coordenadas, o OSRM caído): el panel dibuja líneas rectas en ese caso.
  async forRoute(tenantId: string, routeId: string): Promise<RoadRoute | null> {
    const paradas = await this.prisma.withTenant(tenantId, async (tx) => {
      const ruta = await tx.route.findUnique({
        where: { id: routeId },
        select: {
          id: true,
          stops: {
            orderBy: { sequence: 'asc' },
            select: { lat: true, lng: true },
          },
        },
      });
      if (!ruta) {
        throw new NotFoundException('Ruta no encontrada');
      }
      return ruta.stops;
    });

    const coords = paradas
      .filter((p) => p.lat !== null && p.lng !== null)
      .map((p) => [Number(p.lng), Number(p.lat)] as [number, number]);

    if (coords.length < 2) {
      return null;
    }
    return this.road(coords);
  }

  async road(coords: [number, number][]): Promise<RoadRoute | null> {
    const firma = createHash('sha1')
      .update(
        coords.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(';'),
      )
      .digest('hex');
    const clave = `road:${firma}`;

    const enCache = await this.redis.getJson<RoadRoute>(clave);
    if (enCache) {
      return enCache;
    }

    const base = this.config.get<string>('OSRM_URL', 'http://localhost:5100');
    const puntos = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url = `${base}/route/v1/driving/${puntos}?overview=full&geometries=geojson`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        this.logger.warn(`OSRM respondió ${res.status}`);
        return null;
      }
      const cuerpo = (await res.json()) as OsrmResponse;
      const ruta = cuerpo.routes?.[0];
      if (cuerpo.code !== 'Ok' || !ruta?.geometry?.coordinates?.length) {
        return null;
      }

      const salida: RoadRoute = {
        geometry: ruta.geometry.coordinates,
        distanceKm: Number(((ruta.distance ?? 0) / 1000).toFixed(2)),
        durationMin: Number(((ruta.duration ?? 0) / 60).toFixed(1)),
      };
      await this.redis.setJson(clave, salida, TTL_CACHE);
      return salida;
    } catch (err) {
      // OSRM es opcional: si no está levantado, el reparto sigue funcionando y
      // el mapa cae a líneas rectas. No se propaga el error al usuario.
      this.logger.warn(`OSRM no disponible: ${(err as Error).message}`);
      return null;
    }
  }
}
