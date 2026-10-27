import { Database as DatabaseType } from 'better-sqlite3';
import { RuntimeEvent } from '@relay/contracts';
import { EventEmitter } from 'node:events';
import { SecretRedactor } from '../security/secret-redactor.js';

export type EventCallback = (event: RuntimeEvent) => void;

/**
 * Append-only event log. Events are persisted to SQLite BEFORE being emitted
 * to subscribers (persist-before-broadcast invariant).
 */
export class EventService extends EventEmitter {
  constructor(private db: DatabaseType) {
    super();
    this.setMaxListeners(100);
  }

  recordEvent(eventData: Omit<RuntimeEvent, 'id'>): RuntimeEvent {
    const insert = this.db.prepare(`
      INSERT INTO runtime_events (
        timestamp, type, project_id, run_id, task_id, dispatch_id, session_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      eventData.timestamp,
      eventData.type,
      eventData.projectId ?? null,
      eventData.runId ?? null,
      eventData.taskId ?? null,
      eventData.dispatchId ?? null,
      eventData.sessionId ?? null,
      JSON.stringify(SecretRedactor.redactJson(eventData.payload ?? {}))
    );

    const recordedEvent: RuntimeEvent = {
      id: Number(result.lastInsertRowid),
      ...eventData,
      payload: SecretRedactor.redactJson(eventData.payload ?? {}),
    };

    // Emit only AFTER successful persistence
    this.emit('event', recordedEvent);
    this.emit(recordedEvent.type, recordedEvent);

    return recordedEvent;
  }

  getEventsSince(lastSequence: number, limit = 500): RuntimeEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM runtime_events WHERE id > ? ORDER BY id ASC LIMIT ?')
      .all(lastSequence, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      type: row.type,
      projectId: row.project_id,
      runId: row.run_id,
      taskId: row.task_id,
      dispatchId: row.dispatch_id,
      sessionId: row.session_id,
      payload: JSON.parse(row.payload_json),
    }));
  }

  getEventsForRun(runId: string, limit = 500): RuntimeEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM runtime_events WHERE run_id = ? OR dispatch_id IN (SELECT d.id FROM dispatches d JOIN tasks t ON d.task_id = t.id WHERE t.run_id = ?) ORDER BY id ASC LIMIT ?')
      .all(runId, runId, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      type: row.type,
      projectId: row.project_id,
      runId: row.run_id,
      taskId: row.task_id,
      dispatchId: row.dispatch_id,
      sessionId: row.session_id,
      payload: JSON.parse(row.payload_json),
    }));
  }
}
