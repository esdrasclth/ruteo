import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { pareceNumeroDeRastreo } from '../shipments/tracking-number';

function room(trackingNumber: string): string {
  return `tracking:${trackingNumber}`;
}

/**
 * Cuántos envíos puede seguir una misma conexión.
 *
 * Sin tope, un cliente podía pedir salas sin fin: cada una es una entrada en
 * las tablas del servidor, y con una cadena arbitraria por sala se llenaban con
 * basura que ningún envío iba a usar nunca. Veinte cubre de sobra el caso real
 * —una persona mirando sus paquetes— y quien necesite más abre otra conexión,
 * que es exactamente el punto donde vuelve a contar el límite.
 */
const MAX_SALAS = 20;

// Public realtime channel for "where is my package". Clients subscribe to a
// tracking number and receive milestone updates as they happen.
//
// El origen queda abierto a propósito: es un canal público de solo lectura, sin
// cookies ni credenciales, y el enlace de rastreo se abre desde donde sea que
// el destinatario lo reciba. Lo que se restringe no es quién se conecta, sino
// cuánto puede pedir una vez conectado.
@WebSocketGateway({ namespace: '/tracking', cors: { origin: '*' } })
export class TrackingGateway {
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer()
  private server: Server;

  @SubscribeMessage('subscribe')
  onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { trackingNumber?: string },
  ): { subscribed: string | null } {
    const trackingNumber = data?.trackingNumber;
    // Se comprueba la FORMA, no la existencia: mirar en la base aquí convertiría
    // el gateway en un verificador de números sin sesión ni cupo, que es peor
    // que lo que arregla. Basta con que una cadena cualquiera no cree sala.
    if (!trackingNumber || !pareceNumeroDeRastreo(trackingNumber)) {
      return { subscribed: null };
    }

    const sala = room(trackingNumber);
    // `client.rooms` incluye siempre la sala propia del socket (su id), así que
    // el tope se cuenta contra las que se han pedido, no contra esa.
    const suscrito = client.rooms.has(sala);
    if (!suscrito && client.rooms.size - 1 >= MAX_SALAS) {
      return { subscribed: null };
    }

    void client.join(sala);
    return { subscribed: trackingNumber };
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { trackingNumber?: string },
  ): void {
    if (data?.trackingNumber) {
      void client.leave(room(data.trackingNumber));
    }
  }

  emitShipmentUpdate(trackingNumber: string, payload: unknown): void {
    this.server?.to(room(trackingNumber)).emit('shipment.updated', payload);
    this.logger.debug(`emitted update for ${trackingNumber}`);
  }
}
