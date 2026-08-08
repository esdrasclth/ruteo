import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

export interface GeocodeResult {
  /** Dirección completa de Nominatim. Sirve para desambiguar en la lista. */
  label: string;
  /**
   * Versión corta para guardar en los campos de dirección. Los DTO topan las
   * etiquetas en 160 caracteres y el `display_name` de Nominatim se va
   * fácilmente por encima de 200: guardarlo entero hacía fallar el alta con un
   * error de validación que el usuario no podía entender ni corregir.
   */
  shortLabel: string;
  lat: number;
  lng: number;
  type: string | null;
}

interface NominatimItem {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  address?: Record<string, string | undefined>;
}

const LARGO_MAX = 120;

// "Aeropuerto Toncontín, Tegucigalpa, Honduras" en vez de la cadena de nueve
// componentes que devuelve Nominatim. Se arma con la dirección estructurada
// porque adivinar cuál de los componentes es la ciudad partiendo la cadena por
// comas no es fiable.
function etiquetaCorta(item: NominatimItem): string {
  const dir = item.address ?? {};
  const principal =
    item.name?.trim() || (item.display_name ?? '').split(',')[0].trim();
  const ciudad =
    dir.city ?? dir.town ?? dir.village ?? dir.municipality ?? dir.county;
  const pais = dir.country;

  const partes = [principal, ciudad, pais].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  // Se quitan repetidos: en ciudades grandes el nombre principal ya es la ciudad.
  const unicas = [...new Set(partes)];
  const corta = unicas.join(', ');
  return corta.length > LARGO_MAX ? corta.slice(0, LARGO_MAX).trim() : corta;
}

// Un día: las direcciones no se mueven, y la política de uso de Nominatim pide
// explícitamente cachear en lugar de repetir consultas.
const TTL_CACHE = 60 * 60 * 24;

// Nominatim no entiende las abreviaturas con las que realmente se escriben las
// direcciones en Honduras, y falla en silencio devolviendo cero resultados.
// Comprobado contra el servicio: "Col. Palmira, Tegucigalpa" -> 0 resultados,
// "Colonia Palmira, Tegucigalpa" -> 1. La coma no estorba; la abreviatura sí.
const ABREVIATURAS: [RegExp, string][] = [
  [/\bcol\.?\b/gi, 'Colonia'],
  [/\bres\.?\b/gi, 'Residencial'],
  [/\bbo\.?\b/gi, 'Barrio'],
  [/\bblvd\.?\b/gi, 'Bulevar'],
  [/\bbulev\.?\b/gi, 'Bulevar'],
  [/\bav\.?\b/gi, 'Avenida'],
  [/\bave\.?\b/gi, 'Avenida'],
  [/\bcalz\.?\b/gi, 'Calzada'],
  [/\bedif\.?\b/gi, 'Edificio'],
  [/\bkm\.?\b/gi, 'Kilómetro'],
];

function expandirAbreviaturas(q: string): string {
  return ABREVIATURAS.reduce(
    (texto, [patron, completo]) => texto.replace(patron, completo),
    q,
  ).replace(/\s{2,}/g, ' ');
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async search(query: string): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 3) {
      return [];
    }

    const consulta = expandirAbreviaturas(q);
    // La caché va por la consulta ya expandida: "Col. Palmira" y "Colonia
    // Palmira" son la misma búsqueda y no tiene sentido pagarla dos veces.
    const clave = `geo:${consulta.toLowerCase()}`;
    const enCache = await this.redis.getJson<GeocodeResult[]>(clave);
    if (enCache) {
      return enCache;
    }

    const base = this.config.get<string>(
      'NOMINATIM_URL',
      'https://nominatim.openstreetmap.org',
    );
    const url = new URL('/search', base);
    url.searchParams.set('q', consulta);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '6');
    // Hace falta la dirección estructurada para poder componer `shortLabel`.
    url.searchParams.set('addressdetails', '1');
    // El corredor del negocio es Honduras y Estados Unidos; sesgar la búsqueda
    // evita que "San Pedro" devuelva media docena de países antes que HN.
    url.searchParams.set('countrycodes', 'hn,us');

    try {
      const res = await fetch(url, {
        headers: {
          // La política de Nominatim exige identificar la aplicación. Un
          // navegador no puede fijar User-Agent, y por eso esta llamada vive en
          // el backend en lugar de ir directa desde el panel.
          'User-Agent': this.config.get<string>(
            'NOMINATIM_USER_AGENT',
            'Ruteo/1.0 (logistica; contacto: soporte@ruteo.app)',
          ),
          'Accept-Language': 'es',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        this.logger.warn(`Nominatim respondió ${res.status}`);
        return [];
      }

      const cuerpo = (await res.json()) as NominatimItem[];
      const resultados: GeocodeResult[] = (
        Array.isArray(cuerpo) ? cuerpo : []
      )
        .filter((r) => r.lat && r.lon && r.display_name)
        .map((r) => ({
          label: r.display_name!,
          shortLabel: etiquetaCorta(r) || r.display_name!.slice(0, LARGO_MAX),
          lat: Number(r.lat),
          lng: Number(r.lon),
          type: r.type ?? null,
        }))
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));

      await this.redis.setJson(clave, resultados, TTL_CACHE);
      return resultados;
    } catch (err) {
      // Geocodificar es una ayuda, no un requisito: si el proveedor falla, el
      // usuario todavía puede escribir las coordenadas a mano.
      this.logger.warn(`Geocodificación fallida: ${(err as Error).message}`);
      return [];
    }
  }
}
