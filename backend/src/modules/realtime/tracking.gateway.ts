import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

function room(trackingNumber: string): string {
  return `tracking:${trackingNumber}`;
}

// Public realtime channel for "where is my package". Clients subscribe to a
// tracking number and receive milestone updates as they happen.
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
    if (!trackingNumber) {
      return { subscribed: null };
    }
    void client.join(room(trackingNumber));
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
