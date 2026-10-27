import { WebSocket } from 'ws';
import { EventService } from '../orchestration/event-service.js';
import { ProcessManager } from '../sessions/process-manager.js';
import { RuntimeEvent } from '@relay/contracts';
import { SecretRedactor } from '../security/secret-redactor.js';
import { WebSocketClientMessageSchema as ClientMessageSchema } from '@relay/contracts';

/**
 * Manages authenticated WebSocket clients and broadcasts runtime events.
 * Also serves terminal subscribe/input/resize messages.
 */
export class WebSocketGateway {
  private clients = new Set<WebSocket>();

  constructor(
    private processManager: ProcessManager,
    private eventService: EventService
  ) {
    // Forward every persisted runtime event to all clients
    this.eventService.on('event', (event: RuntimeEvent) => {
      this.broadcastEvent(event);
    });

    // Terminal output is high-volume: persist a compact reference but stream live
    this.processManager.on('output', (evt: { dispatchId: string; data: string }) => {
      const seq = this.nextLocalSequence();
      this.broadcast({
        type: 'terminal.output',
        sequence: seq,
        dispatchId: evt.dispatchId,
        data: SecretRedactor.redact(evt.data),
        timestamp: new Date().toISOString(),
      });
    });

    this.processManager.on('exit', (evt: { dispatchId: string; exitCode: number | null; signal: string | null }) => {
      const recorded = this.eventService.recordEvent({
        timestamp: new Date().toISOString(),
        type: 'terminal.exit',
        dispatchId: evt.dispatchId,
        payload: { exitCode: evt.exitCode, signal: evt.signal },
      });
      this.broadcast({
        type: 'terminal.exit',
        sequence: recorded.id,
        dispatchId: evt.dispatchId,
        exitCode: evt.exitCode,
        signal: evt.signal,
        timestamp: recorded.timestamp,
      });
    });
  }

  // Local sequence for non-persisted high-volume frames (terminal.output).
  // Persisted events use their DB row id; both are monotonic per stream.
  private localSeq = 0;
  private nextLocalSequence(): number {
    this.localSeq += 1;
    return this.localSeq;
  }

  addClient(socket: WebSocket): void {
    this.clients.add(socket);

    socket.on('message', (rawData) => {
      try {
        const parsed=ClientMessageSchema.safeParse(JSON.parse(rawData.toString()));
        if(!parsed.success)return;
        const msg = parsed.data;

        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          return;
        }

        if(msg.type==='subscribe_events'){
          const events=this.eventService.getEventsSince(msg.after,500);
          const cursor=events.length?events[events.length-1].id:msg.after;
          socket.send(JSON.stringify(SecretRedactor.redactJson({type:'event.snapshot',events,cursor,hasMore:events.length===500,timestamp:new Date().toISOString()})));
          return;
        }

        if (msg.type === 'subscribe_terminal' && typeof msg.dispatchId === 'string') {
          const session = this.processManager.getSessionByDispatchId(msg.dispatchId);
          if (session) {
            const snapshot = session.scrollbackBuffer.getSnapshot();
            socket.send(
              JSON.stringify({
                type: 'terminal.snapshot',
                sequence: this.nextLocalSequence(),
                dispatchId: msg.dispatchId,
                data: SecretRedactor.redact(snapshot),
                timestamp: new Date().toISOString(),
              })
            );
          }
          return;
        }

        if (msg.type === 'terminal.input' && typeof msg.dispatchId === 'string') {
          const session = this.processManager.getSessionByDispatchId(msg.dispatchId);
          if (session && typeof msg.data === 'string') {
            this.processManager.sendInput(session.sessionId, msg.data);
          }
          return;
        }

        if (msg.type === 'terminal.resize' && typeof msg.dispatchId === 'string') {
          const session = this.processManager.getSessionByDispatchId(msg.dispatchId);
          if (session && msg.cols && msg.rows) {
            this.processManager.resize(session.sessionId, msg.cols, msg.rows);
          }
          return;
        }
      } catch {
        // Ignore malformed frames
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
    });
  }

  private broadcastEvent(event: RuntimeEvent): void {
    // Map persisted runtime events onto the public WS contract
    const base = { sequence: event.id, timestamp: event.timestamp };
    let msg: Record<string, unknown> | null = null;

    switch (event.type) {
      case 'dispatch.status':
        msg = {
          ...base,
          type: 'dispatch.status',
          dispatchId: event.dispatchId,
          status: (event.payload as any)?.status,
        };
        break;
      case 'run.status':
      case 'run.created':
      case 'run.candidate_selected':
        msg = {
          ...base,
          type: 'run.status',
          runId: event.runId,
          status: (event.payload as any)?.status ?? event.type,
        };
        break;
      case 'validation.command.finished':
        msg = {
          ...base,
          type: 'validation.command.finished',
          dispatchId: event.dispatchId,
          result: event.payload,
        };
        break;
      case 'validation.started':
      case 'validation.completed':
        msg = {
          ...base,
          type: 'validation.command.finished',
          dispatchId: event.dispatchId,
          result: event.payload,
        };
        break;
      case 'terminal.exit':
        // Already broadcast by the processManager exit listener with payload fields
        return;
      default:
        msg = { ...base, type: event.type, payload: event.payload, runId: event.runId, dispatchId: event.dispatchId };
    }

    if (msg) this.broadcast(msg);
  }

  broadcast(message: Record<string, unknown>): void {
    const data = JSON.stringify(SecretRedactor.redactJson(message));
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        // Backpressure guard: skip frames for saturated clients
        if (client.bufferedAmount > 1024 * 1024) continue;
        client.send(data);
      }
    }
  }

  closeAll(code: number, reason: string): void {
    for (const client of this.clients) {
      try {
        client.close(code, reason);
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
  }
}
