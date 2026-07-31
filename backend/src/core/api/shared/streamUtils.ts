import { Response } from 'express';

export class StreamManager {
  private connections = new Map<string, Response[]>();

  addConnection(userId: string, res: Response) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, []);
    }
    this.connections.get(userId)!.push(res);

    res.on('close', () => {
      const userConns = this.connections.get(userId);
      if (userConns) {
        const idx = userConns.indexOf(res);
        if (idx !== -1) {
          userConns.splice(idx, 1);
        }
        if (userConns.length === 0) {
          this.connections.delete(userId);
        }
      }
    });
  }

  emitUpdate(payloadObject: Record<string, unknown>, userIds: string[]) {
    const payload = `data: ${JSON.stringify(payloadObject)}\n\n`;
    for (const userId of userIds) {
      const userConns = this.connections.get(userId);
      if (userConns) {
        for (const res of userConns) {
          res.write(payload);
        }
      }
    }
  }
}
