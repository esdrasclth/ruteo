import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
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
}
