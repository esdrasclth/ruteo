import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Plan } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { esSlugReservado } from '../../../common/tenant-host';

@ValidatorConstraint({ name: 'slugNoReservado' })
class SlugNoReservado implements ValidatorConstraintInterface {
  validate(slug: unknown): boolean {
    return typeof slug === 'string' && !esSlugReservado(slug);
  }

  defaultMessage(): string {
    return 'Ese identificador está reservado. Elige otro.';
  }
}

export class RegisterDto {
  @ApiProperty({ example: 'Encomiendas Aviotech' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  tenantName: string;

  // El slug ES el subdominio por el que entra la empresa, así que aquí se
  // decide algo más que un identificador bonito: quien consiga registrar `api`
  // se queda con `api.ruteo.brandsofts.com`. Ver `common/tenant-host.ts`.
  @ApiProperty({ example: 'aviotech' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric or hyphen',
  })
  // Ni empezar ni terminar en guión, ni llevar dos seguidos: `-mi-empresa` no
  // es una etiqueta DNS válida (RFC 1123) y `mi--empresa` choca con el prefijo
  // `xn--` de los dominios internacionalizados.
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: 'El identificador no puede empezar ni terminar en guión.',
  })
  @Matches(/^(?!.*--)/, {
    message: 'El identificador no puede llevar dos guiones seguidos.',
  })
  @Validate(SlugNoReservado)
  @MinLength(2)
  // 40 y no 63 (el máximo de una etiqueta DNS) porque el slug también prefija
  // el `loginName` en ZITADEL, y ahí compite por espacio con el correo.
  @MaxLength(40)
  slug: string;

  @ApiProperty({ example: 'owner@aviotech.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Sup3rSecret!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  // Se pide en el alta —y es el ÚNICO campo que se añadió— porque un plan de
  // prueba hay que cerrarlo hablando con alguien: una cuenta que pidió Pro y no
  // deja forma de contactar es una venta perdida por no preguntar un dato.
  //
  // La validación es deliberadamente laxa: se acepta cualquier cosa con entre 8
  // y 20 dígitos, con o sin `+`, espacios, guiones o paréntesis. Un patrón
  // estricto de números hondureños rechazaría a un cliente con número de EE UU
  // —que los hay, es un courier— y el coste de un teléfono mal escrito lo paga
  // quien llama, no el sistema.
  @ApiProperty({ example: '+504 9999-8888' })
  @IsString()
  @Matches(/^\+?[\d\s()-]{8,20}$/, {
    message: 'El teléfono no parece válido.',
  })
  phone: string;

  // Opcional: sin plan se entra en FREE. Con un plan de pago NO se activa nada
  // cobrable —ver `AuthService.register`—, se abre una prueba con fecha de fin.
  @ApiPropertyOptional({ enum: Plan, example: Plan.STARTER })
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;
}
