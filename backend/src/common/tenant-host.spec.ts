import { esOrigenDeTenant, esSlugReservado, urlDeTenant } from './tenant-host';

const PLANTILLA = 'https://{slug}.ruteo.brandsofts.com';

describe('urlDeTenant', () => {
  it('sustituye el marcador', () => {
    expect(urlDeTenant(PLANTILLA, 'enviospress')).toBe(
      'https://enviospress.ruteo.brandsofts.com',
    );
  });

  it('funciona con la plantilla de desarrollo, que lleva puerto', () => {
    expect(urlDeTenant('http://{slug}.localhost:3001', 'aviotech')).toBe(
      'http://aviotech.localhost:3001',
    );
  });
});

describe('esSlugReservado', () => {
  // Estos tres son los que convierten un registro en un secuestro de host.
  it.each(['api', 'panel', 'www'])('rechaza %s', (slug) => {
    expect(esSlugReservado(slug)).toBe(true);
  });

  it('rechaza los de correo que usan las CA para validar dominios', () => {
    expect(esSlugReservado('postmaster')).toBe(true);
    expect(esSlugReservado('hostmaster')).toBe(true);
  });

  it('no distingue mayúsculas', () => {
    expect(esSlugReservado('API')).toBe(true);
  });

  it('deja pasar un nombre de empresa normal', () => {
    expect(esSlugReservado('enviospress')).toBe(false);
  });
});

describe('esOrigenDeTenant', () => {
  it('acepta un subdominio de empresa', () => {
    expect(
      esOrigenDeTenant(PLANTILLA, 'https://enviospress.ruteo.brandsofts.com'),
    ).toBe(true);
  });

  // El fallo clásico de comprobar con `endsWith`: este host TERMINA en
  // `.ruteo.brandsofts.com`… dentro de un dominio que no es nuestro.
  it('rechaza un dominio de atacante que contiene el nuestro', () => {
    expect(
      esOrigenDeTenant(PLANTILLA, 'https://ruteo.brandsofts.com.atacante.io'),
    ).toBe(false);
  });

  it('rechaza un sufijo pegado sin punto', () => {
    expect(esOrigenDeTenant(PLANTILLA, 'https://malruteo.brandsofts.com')).toBe(
      false,
    );
  });

  it('rechaza http:// cuando la plantilla exige https', () => {
    expect(
      esOrigenDeTenant(PLANTILLA, 'http://enviospress.ruteo.brandsofts.com'),
    ).toBe(false);
  });

  it('rechaza un subdominio de segundo nivel', () => {
    // `a.b.ruteo…` no lo puede producir ningún registro: el slug no admite punto.
    expect(
      esOrigenDeTenant(PLANTILLA, 'https://a.b.ruteo.brandsofts.com'),
    ).toBe(false);
  });

  it('rechaza un puerto añadido al final', () => {
    expect(
      esOrigenDeTenant(
        PLANTILLA,
        'https://enviospress.ruteo.brandsofts.com:8443',
      ),
    ).toBe(false);
  });

  it('rechaza el dominio raíz sin subdominio', () => {
    expect(esOrigenDeTenant(PLANTILLA, 'https://ruteo.brandsofts.com')).toBe(
      false,
    );
  });

  it('rechaza caracteres fuera del juego que permite el registro', () => {
    expect(
      esOrigenDeTenant(PLANTILLA, 'https://envios_press.ruteo.brandsofts.com'),
    ).toBe(false);
  });
});
