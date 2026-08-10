import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaginacionDto, saltar, TOPE_CATALOGO } from './paginacion.dto';

// `page` y `pageSize` llegan como texto en la query. Si la conversión o los
// límites fallan, `skip`/`take` reciben basura y Prisma o revienta o se trae la
// tabla entera —que es justo lo que esto viene a evitar—.

function desdeQuery(query: Record<string, unknown>) {
  const dto = plainToInstance(PaginacionDto, query, {
    enableImplicitConversion: true,
  });
  return { dto, errores: validateSync(dto) };
}

describe('PaginacionDto', () => {
  it('sin parámetros usa la primera página', () => {
    const { dto, errores } = desdeQuery({});
    expect(errores).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('convierte el texto de la query a número', () => {
    const { dto, errores } = desdeQuery({ page: '3', pageSize: '50' });
    expect(errores).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(50);
  });

  // Sin tope, `?pageSize=1000000` devuelve la tabla completa y el límite es
  // decorativo.
  it('rechaza un tamaño de página por encima del máximo', () => {
    const { errores } = desdeQuery({ pageSize: '1000' });
    expect(errores.length).toBeGreaterThan(0);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc']])('rechaza page=%s', (page) => {
    expect(desdeQuery({ page }).errores.length).toBeGreaterThan(0);
  });
});

describe('saltar', () => {
  it('la primera página no salta nada', () => {
    expect(saltar({ page: 1, pageSize: 20 })).toBe(0);
  });

  it('salta las páginas anteriores completas', () => {
    expect(saltar({ page: 3, pageSize: 20 })).toBe(40);
    expect(saltar({ page: 2, pageSize: 50 })).toBe(50);
  });
});

describe('TOPE_CATALOGO', () => {
  // No es una preferencia: por debajo del máximo de página, un catálogo topado
  // devolvería menos que un listado paginado y el tope dejaría de ser holgado.
  it('es holgadamente mayor que una página completa', () => {
    expect(TOPE_CATALOGO).toBeGreaterThan(100);
  });
});
