import { BadRequestException } from '@nestjs/common';
import { RoutesService } from './routes.service';

// La comprobación de la clave de evidencia. Es lo único que separa "hay una
// foto de esta entrega" de "hay una foto de alguna entrega".

const TENANT = '9f3c0000-0000-0000-0000-000000000001';
const PARADA = '1a2b0000-0000-0000-0000-0000000000aa';
const OTRA_PARADA = '1a2b0000-0000-0000-0000-0000000000bb';
const OTRO_TENANT = '9f3c0000-0000-0000-0000-000000000002';

const claveValida = `t/${TENANT}/prueba-entrega/${PARADA}/foto.jpg`;

function montar(opciones: { existe?: boolean } = {}) {
  const storage = {
    comprobar: jest.fn(() =>
      Promise.resolve(
        opciones.existe === false
          ? null
          : { sizeBytes: 1024, contentType: 'image/jpeg' },
      ),
    ),
  };

  const servicio = new RoutesService(
    {} as never,
    {} as never,
    storage as never,
  );

  // `comprobarEvidencia` es privado a propósito —no es API del servicio— pero
  // es donde vive la regla, así que se prueba directamente en vez de montar
  // media base de datos alrededor para llegar a ella.
  const comprobar = (clave?: string) =>
    (
      servicio as unknown as {
        comprobarEvidencia: (
          t: string,
          s: string,
          c?: string,
        ) => Promise<string | undefined>;
      }
    ).comprobarEvidencia(TENANT, PARADA, clave);

  return { comprobar, storage };
}

describe('comprobarEvidencia', () => {
  it('acepta la clave de esta parada', async () => {
    const { comprobar } = montar();
    await expect(comprobar(claveValida)).resolves.toBe(claveValida);
  });

  it('sin clave no hay nada que comprobar', async () => {
    const { comprobar, storage } = montar();
    await expect(comprobar(undefined)).resolves.toBeUndefined();
    expect(storage.comprobar).not.toHaveBeenCalled();
  });

  // El caso que importa: la clave viaja en el cuerpo y quien llama la controla.
  // Sin esto, mandar la clave de la firma de OTRA entrega la dejaría como prueba
  // de esta —que es lo que haría alguien para cerrar una parada que no hizo—.
  it('rechaza la evidencia de otra parada', async () => {
    const { comprobar, storage } = montar();
    await expect(
      comprobar(`t/${TENANT}/prueba-entrega/${OTRA_PARADA}/foto.jpg`),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Ni siquiera llega a preguntarle al almacenamiento.
    expect(storage.comprobar).not.toHaveBeenCalled();
  });

  it('rechaza la evidencia de otra empresa', async () => {
    const { comprobar } = montar();
    await expect(
      comprobar(`t/${OTRO_TENANT}/prueba-entrega/${PARADA}/foto.jpg`),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una clave de otra categoría', async () => {
    const { comprobar } = montar();
    await expect(
      comprobar(`t/${TENANT}/documentos/${PARADA}/factura.pdf`),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // La URL de subida se entrega y después no se sabe qué pasó: el móvil del
  // repartidor pudo perder cobertura a mitad. Sin esto, la parada queda cerrada
  // "con foto" y la foto no existe, y se descubre semanas después.
  it('rechaza una clave cuyo archivo no llegó a subirse', async () => {
    const { comprobar } = montar({ existe: false });
    await expect(comprobar(claveValida)).rejects.toThrow(/no se completó/i);
  });
});
