import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL_APP: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_TTL: string;

  // Base URL used to build public tracking links (QR labels).
  @IsOptional()
  @IsString()
  PUBLIC_APP_URL: string = 'http://localhost:3000';

  @IsOptional()
  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsOptional()
  @IsNumber()
  REDIS_PORT: number = 6379;

  // Namespace de las colas BullMQ en Redis; permite que varios entornos
  // compartan la misma instancia sin pisarse los jobs.
  @IsOptional()
  @IsString()
  QUEUE_PREFIX: string = 'bull';

  // Allowed CORS origin for the web panel.
  @IsOptional()
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3001';
}

export function validateEnv(config: Record<string, unknown>) {
  // `config` solo trae lo que se leyó del archivo `.env`. El objeto validado que
  // devolvemos tiene prioridad en `ConfigService`, así que si no mezclamos aquí
  // las variables de entorno reales, sus valores quedan tapados por los
  // defaults de esta clase: en Docker/CI —donde se configura por entorno y no
  // por archivo— la app arrancaría con PORT 3000 y el CORS apuntando a
  // localhost sin avisar de nada.
  //
  // El entorno real gana sobre el archivo, que es el orden de 12-factor y el
  // mismo que aplica dotenv al cargar `.env`.
  const merged: Record<string, unknown> = { ...config, ...process.env };

  const validated = plainToInstance(EnvironmentVariables, merged, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validated;
}
