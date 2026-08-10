import { EventEmitter } from 'node:events';
import {
  DestinoNoPermitido,
  enviarAlDestino,
  validarDestinoWebhook,
} from './destino-seguro';

// El módulo resuelve DNS de verdad; aquí se controla qué devuelve para poder
// probar el caso que importa —un dominio público que apunta a una IP interna—
// sin depender de la red.
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

// Y aquí se intercepta la petición para poder mirar CÓMO se conecta, que es lo
// que decide si el arreglo funciona. Levantar un HTTPS real con certificado
// propio probaría lo mismo y añadiría una infraestructura de test que se rompe
// sola cuando caduque el certificado.
jest.mock('node:https', () => ({ request: jest.fn() }));

import { lookup } from 'node:dns/promises';
import { request as peticionHttps } from 'node:https';

const lookupMock = lookup as jest.MockedFunction<typeof lookup>;

function resuelveA(...ips: string[]) {
  lookupMock.mockResolvedValue(
    ips.map((address) => ({
      address,
      family: address.includes(':') ? 6 : 4,
    })) as never,
  );
}

describe('validarDestinoWebhook', () => {
  beforeEach(() => {
    lookupMock.mockReset();
    resuelveA('93.184.216.34'); // IP pública por defecto
  });

  it('acepta un endpoint https público', async () => {
    await expect(
      validarDestinoWebhook('https://tienda.example.com/hooks/ruteo'),
    ).resolves.toEqual({ ip: '93.184.216.34', familia: 4 });
  });

  // Lo que cierra la carrera: quien entrega no vuelve a preguntar por el
  // nombre, usa esta dirección. Si dejara de devolverla, la entrega volvería a
  // resolver por su cuenta y el DNS rebinding quedaría abierto otra vez.
  it('devuelve la IP comprobada para que la entrega se conecte a ella', async () => {
    resuelveA('93.184.216.34', '198.51.100.7');
    await expect(
      validarDestinoWebhook('https://tienda.example.com/hook'),
    ).resolves.toEqual({ ip: '93.184.216.34', familia: 4 });
  });

  it('marca la familia correcta en una dirección IPv6', async () => {
    await expect(
      validarDestinoWebhook('https://[2606:2800:220:1::1]/hook'),
    ).resolves.toEqual({ ip: '2606:2800:220:1::1', familia: 6 });
  });

  it('rechaza http:// para que los datos del cliente no viajen en claro', async () => {
    await expect(
      validarDestinoWebhook('http://tienda.example.com/hooks'),
    ).rejects.toBeInstanceOf(DestinoNoPermitido);
  });

  // El caso concreto que motivó todo esto: el metadata de la nube.
  it('rechaza el link-local del metadata de la nube', async () => {
    await expect(
      validarDestinoWebhook('https://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow(/red interna/);
  });

  it.each([
    ['loopback', 'https://127.0.0.1/hook'],
    ['privada 10/8', 'https://10.0.0.5/hook'],
    ['privada 192.168/16', 'https://192.168.1.10/hook'],
    ['privada 172.16/12', 'https://172.20.0.3/hook'],
    ['CGNAT', 'https://100.100.0.1/hook'],
    ['loopback IPv6', 'https://[::1]/hook'],
    ['única local IPv6', 'https://[fd00::1]/hook'],
  ])('rechaza %s escrita como IP', async (_caso, url) => {
    await expect(validarDestinoWebhook(url)).rejects.toBeInstanceOf(
      DestinoNoPermitido,
    );
  });

  // Lo que hace falta revalidar antes de cada entrega: la URL parece pública y
  // el DNS la resuelve hacia dentro.
  it('rechaza un dominio público que resuelve a una IP interna', async () => {
    resuelveA('127.0.0.1');
    await expect(
      validarDestinoWebhook('https://parece-legitimo.com/hook'),
    ).rejects.toThrow(/red interna/);
  });

  it('rechaza si CUALQUIERA de las IPs resueltas es interna', async () => {
    resuelveA('93.184.216.34', '10.0.0.1');
    await expect(
      validarDestinoWebhook('https://mixto.example.com/hook'),
    ).rejects.toThrow(/red interna/);
  });

  it('rechaza puertos que no son de web', async () => {
    await expect(
      validarDestinoWebhook('https://example.com:6379/hook'),
    ).rejects.toThrow(/puerto/);
  });

  it('rechaza un dominio que no resuelve', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(
      validarDestinoWebhook('https://no-existe.example.com/hook'),
    ).rejects.toThrow(/resolver/);
  });

  // La vía de escape para desarrollo, que en producción va apagada. Devuelve
  // `ip: null` porque no se comprobó nada: sin comprobación no hay dirección
  // que fijar, y la entrega cae al camino normal.
  it('deja pasar destinos internos cuando se permiten explícitamente', async () => {
    await expect(
      validarDestinoWebhook('http://localhost:4000/hook', true),
    ).resolves.toEqual({ ip: null, familia: 4 });
  });
});

// Validar bien y luego conectarse a otro sitio es no haber validado. Estas
// pruebas son sobre la conexión, que es donde el agujero seguía abierto.
describe('enviarAlDestino', () => {
  const requestMock = peticionHttps as unknown as jest.Mock;
  let opcionesUsadas: Record<string, unknown>;

  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockImplementation(
      (
        opciones: Record<string, unknown>,
        alResponder: (r: unknown) => void,
      ) => {
        opcionesUsadas = opciones;
        const res = new EventEmitter() as EventEmitter & {
          statusCode: number;
          resume: () => void;
        };
        res.statusCode = 204;
        res.resume = () => undefined;
        setImmediate(() => {
          alResponder(res);
          res.emit('end');
        });
        return {
          setTimeout: () => undefined,
          on: () => undefined,
          end: () => undefined,
          destroy: () => undefined,
        };
      },
    );
  });

  const envio = () =>
    enviarAlDestino(
      'https://tienda.example.com/hooks/ruteo?x=1',
      { ip: '93.184.216.34', familia: 4 },
      {
        headers: { 'x-ruteo-event': 'shipment.created' },
        body: '{}',
        timeoutMs: 5000,
      },
    );

  it('resuelve con el estado que devolvió el endpoint', async () => {
    await expect(envio()).resolves.toEqual({ status: 204 });
  });

  // El corazón del arreglo: el socket va a la IP comprobada, pase lo que pase
  // con el DNS entre la validación y este momento.
  it('conecta contra la IP fijada y no vuelve a resolver el nombre', async () => {
    await envio();

    const lookupFijado = opcionesUsadas.lookup as (
      host: string,
      opts: { all?: boolean },
      cb: (e: unknown, dir: unknown, fam?: number) => void,
    ) => void;
    expect(lookupFijado).toBeInstanceOf(Function);

    const sencillo = jest.fn();
    lookupFijado('tienda.example.com', {}, sencillo);
    expect(sencillo).toHaveBeenCalledWith(null, '93.184.216.34', 4);

    // El socket a veces pide la lista entera; contestar en la forma que no
    // espera hace fallar la conexión con un error que no explica nada.
    const conTodas = jest.fn();
    lookupFijado('tienda.example.com', { all: true }, conTodas);
    expect(conTodas).toHaveBeenCalledWith(null, [
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  // Si se sustituyera el hostname por la IP en vez de redirigir la resolución,
  // TLS presentaría el SNI equivocado y el certificado no validaría. El
  // receptor tiene que ver exactamente la misma petición de siempre.
  it('mantiene el nombre para el SNI, el certificado y la cabecera Host', async () => {
    await envio();
    expect(opcionesUsadas.hostname).toBe('tienda.example.com');
    expect(opcionesUsadas.path).toBe('/hooks/ruteo?x=1');
    expect(opcionesUsadas.method).toBe('POST');
  });

  it('en modo desarrollo no fija nada y no usa el camino de IP fijada', async () => {
    const fetchFalso = jest.fn().mockResolvedValue({ status: 200 });
    const original = global.fetch;
    global.fetch = fetchFalso;
    try {
      await expect(
        enviarAlDestino(
          'http://localhost:4000/hook',
          { ip: null, familia: 4 },
          { headers: {}, body: '{}', timeoutMs: 5000 },
        ),
      ).resolves.toEqual({ status: 200 });
      expect(requestMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = original;
    }
  });
});
