import type { WebSocketServer, WebSocket } from 'ws';

export interface RoomWebSocket extends WebSocket {
  room?: string;
}

export abstract class GatewayAdapter {
  protected server: WebSocketServer | null = null;

  abstract createServer(): void;
  abstract destroy(): void;

  protected onConnection(ws: WebSocket): void {
    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('close', () => this.handleDisconnect(ws));
  }

  protected abstract handleMessage(ws: WebSocket, data: unknown): void;
  protected abstract handleDisconnect(ws: WebSocket): void;

  broadcast(event: string, data: unknown, room?: string): void {
    if (!this.server) return;
    this.server.clients.forEach((client) => {
      if (client.readyState !== 1) return;
      if (room && (client as RoomWebSocket).room !== room) return;
      client.send(JSON.stringify({ event, data }));
    });
  }
}
