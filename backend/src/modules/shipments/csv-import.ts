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
    }) as Record<string, string>[];
  } catch (err) {
    throw new Error(
      `CSV parse error: ${err instanceof Error ? err.message : 'invalid file'}`,
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
