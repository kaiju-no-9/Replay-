import type { FastifyInstance } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ProcessManager } from '../sessions/process-manager.js';
import type { WebSocketGateway } from './ws-gateway.js';

export function registerGracefulShutdown(
  server: FastifyInstance,
  db: DatabaseType,
  processManager: ProcessManager,
  wsGateway: WebSocketGateway,
  options: { gracePeriodMs?: number } = {}
): void {
  const gracePeriod = options.gracePeriodMs ?? 5000;
  let isShuttingDown = false;

  const handleSignal = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    server.log.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

    try {
      wsGateway.broadcast({
        type: 'runtime.error',
        sequence: 0,
        code: 'RUNTIME_SHUTTING_DOWN',
        message: 'Relay runtime is shutting down.',
        recoverable: false,
        timestamp: new Date().toISOString(),
      });
      wsGateway.closeAll(1001, 'Runtime shutting down');
    } catch (err: any) {
      server.log.error({ err }, 'Error closing WebSockets');
    }

    // Close WebSocket clients before Fastify's close hook waits for active
    // connections to drain. Waiting on server.close() first deadlocks while
    // authenticated WebSocket clients remain open (and leaves tsx watch unable
    // to restart the old runtime process).
    try {
      await server.close();
      server.log.info('HTTP server closed to new requests.');
    } catch (err: any) {
      server.log.error({ err }, 'Error closing HTTP server');
    }

    try {
      const activePids = processManager.getActivePids();
      if (activePids.length > 0) {
        server.log.info(`Terminating ${activePids.length} active agent processes...`);
        await processManager.terminateAll(gracePeriod);
      }
    } catch (err: any) {
      server.log.error({ err }, 'Error terminating processes');
    }

    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      server.log.info('SQLite database closed.');
    } catch (err: any) {
      server.log.error({ err }, 'Error closing SQLite database');
    }

    server.log.info('Relay runtime stopped cleanly.');
    process.exit(0);
  };

  process.on('SIGINT', () => void handleSignal('SIGINT'));
  process.on('SIGTERM', () => void handleSignal('SIGTERM'));
}
