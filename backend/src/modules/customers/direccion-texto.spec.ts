import { etiquetaDeDireccion } from './direccion-texto';

// El texto que se congela en el envío. Si esto se compone mal, el error no se
// ve al crear el envío: se ve meses después, cuando alguien lee a dónde se
// entregó y falta la mitad de la dirección.

const BASE = {
  department: 'Francisco Morazán',
  municipality: 'Tegucigalpa',
};

describe('etiquetaDeDireccion', () => {
  it('va de lo fino a lo grueso, como se lee una dirección', () => {
    expect(
      etiquetaDeDireccion({
        ...BASE,
        neighborhood: 'Col. Palmira',
        street: 'Calle Principal, casa 1425',
      }),
    ).toBe(
      'Calle Principal, casa 1425, Col. Palmira, Tegucigalpa, Francisco Morazán',
    );
  });

  it('omite lo que falta sin dejar comas huérfanas', () => {
    expect(etiquetaDeDireccion(BASE)).toBe('Tegucigalpa, Francisco Morazán');
  });

  // En media Honduras la referencia es lo único que lleva a la puerta. Perderla
  // al copiar dejaría el envío con una dirección peor que la que escribió el
  // cliente.
  it('conserva la referencia', () => {
    expect(
      etiquetaDeDireccion({
        ...BASE,
        neighborhood: 'Col. Kennedy',
        reference: 'Portón negro frente a la pulpería',
      }),
    ).toBe(
      'Col. Kennedy, Tegucigalpa, Francisco Morazán (Portón negro frente a la pulpería)',
    );
  });

  it('trata los espacios en blanco como ausencia', () => {
    expect(
      etiquetaDeDireccion({
        ...BASE,
        neighborhood: '   ',
        street: '',
        reference: '  ',
      }),
    ).toBe('Tegucigalpa, Francisco Morazán');
  });
});
