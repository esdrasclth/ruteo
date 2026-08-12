import {
  CATEGORIAS,
  claveDe,
  esDelTenant,
  prefijoDe,
  prefijoDeTenant,
} from './claves';

const TENANT = '9f3c0000-0000-0000-0000-000000000001';
const OTRO = '9f3c0000-0000-0000-0000-000000000002';

describe('claves del almacenamiento', () => {
  it('arma la ruta con la empresa primero', () => {
    const clave = claveDe({
      tenantId: TENANT,
      categoria: CATEGORIAS.FOTOS_PAQUETE,
      propietarioId: 'paquete-1',
      nombreOriginal: 'foto.JPG',
    });
    expect(clave).toMatch(
      new RegExp(`^t/${TENANT}/fotos-paquete/paquete-1/[0-9a-f-]{36}\\.jpg$`),
    );
  });

  // El nombre que trae el usuario no forma parte de la ruta: solo se le saca la
  // extensión. Dos personas subiendo `factura.pdf` al mismo envío se pisarían.
  it('dos subidas seguidas nunca coinciden', () => {
    const datos = {
      tenantId: TENANT,
      categoria: CATEGORIAS.DOCUMENTOS,
      propietarioId: 'envio-1',
      nombreOriginal: 'factura.pdf',
    };
    expect(claveDe(datos)).not.toBe(claveDe(datos));
  });

  it('no deja que el nombre del archivo se cuele en la ruta', () => {
    const clave = claveDe({
      tenantId: TENANT,
      categoria: CATEGORIAS.DOCUMENTOS,
      propietarioId: 'envio-1',
      nombreOriginal: '../../../etc/passwd',
    });
    expect(clave).not.toContain('..');
    expect(clave).not.toContain('passwd');
    expect(clave.split('/')).toHaveLength(5);
  });

  it('descarta extensiones que no lo son', () => {
    for (const nombre of [
      'foto.<script>',
      'x.',
      'sin-extension',
      'a.demasiadolarga',
    ]) {
      const clave = claveDe({
        tenantId: TENANT,
        categoria: CATEGORIAS.RECLAMOS,
        propietarioId: 'r1',
        nombreOriginal: nombre,
      });
      expect(clave).toMatch(/[0-9a-f-]{36}$/);
    }
  });

  // Esta es la comprobación con consecuencia: el almacenamiento de objetos no
  // tiene RLS. El id del archivo viaja en la petición y quien la manda lo
  // controla, así que sin esto leer lo de otra empresa es probar claves.
  describe('esDelTenant', () => {
    it('acepta lo propio', () => {
      const clave = claveDe({
        tenantId: TENANT,
        categoria: CATEGORIAS.PRUEBA_ENTREGA,
        propietarioId: 'envio-1',
      });
      expect(esDelTenant(clave, TENANT)).toBe(true);
    });

    it('rechaza lo de otra empresa', () => {
      const ajena = claveDe({
        tenantId: OTRO,
        categoria: CATEGORIAS.PRUEBA_ENTREGA,
        propietarioId: 'envio-1',
      });
      expect(esDelTenant(ajena, TENANT)).toBe(false);
    });

    // El prefijo lleva la barra final a propósito: sin ella, una empresa cuyo
    // id empiece igual que el de otra pasaría la comprobación.
    it('no confunde un id que empieza igual', () => {
      expect(esDelTenant(`t/${TENANT}-bis/documentos/x/y.pdf`, TENANT)).toBe(
        false,
      );
    });

    it('rechaza una ruta que mete el id de la empresa más adentro', () => {
      expect(esDelTenant(`t/${OTRO}/documentos/${TENANT}/y.pdf`, TENANT)).toBe(
        false,
      );
    });
  });

  it('los prefijos sirven para listar y para dar de baja', () => {
    expect(prefijoDe(TENANT, CATEGORIAS.FOTOS_PAQUETE, 'p1')).toBe(
      `t/${TENANT}/fotos-paquete/p1/`,
    );
    expect(prefijoDeTenant(TENANT)).toBe(`t/${TENANT}/`);
  });
});
