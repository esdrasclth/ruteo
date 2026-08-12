import { firmarPod, firmarPodsDeParadas } from './firmar-pod';
import { StorageService } from './storage.service';

// La evidencia se guarda como CLAVE y se firma al leer. Guardar la URL firmada
// sería dejar escrito un pase permanente: quien la tuviera vería el archivo sin
// sesión y para siempre.

const TENANT = '9f3c0000-0000-0000-0000-000000000001';

function storageFalso(opciones: { falla?: boolean } = {}) {
  return {
    firmarDescarga: jest.fn((clave: string) => {
      if (opciones.falla) return Promise.reject(new Error('almacén caído'));
      return Promise.resolve(`https://s3.example/${clave}?firma=abc`);
    }),
  } as unknown as StorageService;
}

describe('firmarPod', () => {
  it('firma ambas claves', async () => {
    const pod = await firmarPod(
      storageFalso(),
      { signatureKey: 't/x/firma.png', photoKey: 't/x/foto.jpg' },
      TENANT,
    );
    expect(pod?.signatureUrl).toContain('firma.png?firma=abc');
    expect(pod?.photoUrl).toContain('foto.jpg?firma=abc');
  });

  it('lo que no está sigue sin estar', async () => {
    const pod = await firmarPod(
      storageFalso(),
      { signatureKey: null, photoKey: null },
      TENANT,
    );
    expect(pod).toEqual({
      signatureKey: null,
      photoKey: null,
      signatureUrl: null,
      photoUrl: null,
    });
  });

  it('sin POD no hay nada que firmar', async () => {
    await expect(firmarPod(storageFalso(), null, TENANT)).resolves.toBeNull();
  });

  // Datos anteriores al cambio de columnas: firmar una URL como si fuera clave
  // daría un enlace roto y el archivo viejo dejaría de verse.
  it('deja pasar una URL completa de antes de la migración', async () => {
    const pod = await firmarPod(
      storageFalso(),
      { signatureKey: null, photoKey: 'https://cdn.viejo/foto.jpg' },
      TENANT,
    );
    expect(pod?.photoUrl).toBe('https://cdn.viejo/foto.jpg');
  });

  // Una ruta con veinte paradas no debe quedarse en blanco porque el
  // almacenamiento no responda: se pierde la evidencia, no la pantalla.
  it('si el almacenamiento falla, devuelve el POD sin enlaces', async () => {
    const pod = await firmarPod(
      storageFalso({ falla: true }),
      { signatureKey: 't/x/firma.png', photoKey: 't/x/foto.jpg' },
      TENANT,
    );
    expect(pod?.signatureUrl).toBeNull();
    expect(pod?.photoUrl).toBeNull();
  });
});

describe('firmarPodsDeParadas', () => {
  it('firma las paradas que tienen POD y respeta las que no', async () => {
    const paradas = await firmarPodsDeParadas(
      storageFalso(),
      [
        { id: 'p1', pod: { signatureKey: null, photoKey: 't/x/a.jpg' } },
        { id: 'p2', pod: null },
      ],
      TENANT,
    );

    expect(paradas[0].pod?.photoUrl).toContain('a.jpg');
    expect(paradas[1].pod).toBeNull();
    // El resto de la parada llega intacto.
    expect(paradas[1].id).toBe('p2');
  });
});
