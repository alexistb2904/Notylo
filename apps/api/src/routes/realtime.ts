import { validClientId } from "../security.js";
import { findCloudDocument } from "../db.js";
import type { ApiContext, RealtimeSocket } from "../types.js";

const maxMessageBytes = 256 * 1024;
const maxConnectionsPerRoom = 25;
const maxMessagesPerWindow = 120;
const messageWindowMs = 30_000;

export function registerRealtimeRoutes(context: ApiContext): void {
  const { app, pool } = context;
  app.get<{ Params: { notebookId: string } }>(
    "/sync/:notebookId",
    { websocket: true },
    async (socket, request) => {
      const client = socket as RealtimeSocket;
      try {
        await request.jwtVerify();
        if (request.user.type === "refresh" || !validClientId(request.params.notebookId))
          throw new Error("invalid session");
        if (!(await findCloudDocument(pool, request.params.notebookId, request.user.sub)))
          throw new Error("not found");
      } catch {
        client.close(1008);
        return;
      }
      const room = context.sessions.get(request.params.notebookId) ?? new Set<RealtimeSocket>();
      if (room.size >= maxConnectionsPerRoom) {
        client.close(1013);
        return;
      }
      context.sessions.set(request.params.notebookId, room);
      room.add(client);
      let messageCount = 0;
      let windowStarted = Date.now();
      client.on("message", (message) => {
        const now = Date.now();
        if (now - windowStarted >= messageWindowMs) {
          messageCount = 0;
          windowStarted = now;
        }
        if (++messageCount > maxMessagesPerWindow) {
          client.close(1008);
          return;
        }
        const payload = message instanceof Buffer ? message : Buffer.from(String(message));
        if (payload.byteLength > maxMessageBytes) {
          client.close(1009);
          return;
        }
        for (const peer of room) if (peer !== client && peer.readyState === 1) peer.send(payload);
      });
      client.on("close", () => {
        room.delete(client);
        if (!room.size) context.sessions.delete(request.params.notebookId);
      });
    }
  );
}
