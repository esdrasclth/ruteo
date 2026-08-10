import { parse } from 'csv-parse/sync';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateShipmentDto } from './dto/create-shipment.dto';

export interface ParsedRow {
  line: number; // 1-based data line (excludes header)
  dto: CreateShipmentDto;
}

export interface RowError {
  line: number;
  errors: string[];
}

export interface CsvParseResult {
  valid: ParsedRow[];
  invalid: RowError[];
}

// Tope de filas por importación.
//
// Cada fila válida acaba en su propia transacción dentro de `importCsv`, así
// que un archivo grande no ocupa memoria: ocupa la conexión a la base y el
// worker durante todo lo que tarde. Sin tope, un CSV de 100.000 filas deja la
// petición viva minutos y compite con el resto del tenant.
//
// 10.000 cubre con holgura una importación real (un catálogo de envíos de un
// día) y quien necesite más parte el archivo, que es una operación que se
// entiende sola.
export const MAX_FILAS = 10_000;

const NUMERIC_FIELDS = [
  'destinationLat',
  'destinationLng',
  'weightKg',
  'declaredValue',
  'codAmount',
] as const;

// Empty cells become undefined; numeric columns are coerced so class-validator's
// @IsNumber/@IsLatitude rules see real numbers instead of strings.
function coerce(record: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(record)) {
    const value = raw?.trim();
    if (value === undefined || value === '') continue;
    if ((NUMERIC_FIELDS as readonly string[]).includes(key)) {
      const num = Number(value);
      out[key] = Number.isNaN(num) ? value : num; // keep bad value so validation flags it
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function parseShipmentCsv(content: string): CsvParseResult {
  let records: Record<string, string>[];
  try {
    records = parse(content, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    throw new Error(
      `CSV parse error: ${err instanceof Error ? err.message : 'invalid file'}`,
    );
  }

  if (records.length > MAX_FILAS) {
    throw new Error(
      `El archivo trae ${records.length} filas y el máximo por importación es ${MAX_FILAS}. Pártelo en varios archivos.`,
    );
  }

  const valid: ParsedRow[] = [];
  const invalid: RowError[] = [];

  records.forEach((record, index) => {
    const line = index + 1;
    const dto = plainToInstance(CreateShipmentDto, coerce(record));
    const failures = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (failures.length > 0) {
      invalid.push({
        line,
        errors: failures.flatMap((f) => Object.values(f.constraints ?? {})),
      });
    } else {
      valid.push({ line, dto });
    }
  });

  return { valid, invalid };
}
