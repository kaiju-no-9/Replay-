import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';

import { getDatabase } from './persistence/database.js';
import { runMigrations } from './persistence/migrations.js';
import { ProjectRepository } from './persistence/repositories/project-repo.js';
import { RunRepository } from './persistence/repositories/run-repo.js';
import { TaskRepository } from './persistence/repositories/task-repo.js';
import { DispatchRepository } from './persistence/repositories/dispatch-repo.js';
import { WorktreeRepository } from './persistence/repositories/worktree-repo.js';

import { EventService } from './orchestration/event-service.js';
import { RunCoordinator } from './orchestration/run-coordinator.js';

import { ProcessManager } from './sessions/process-manager.js';
import { ValidationService } from './validation/validation-service.js';
import { ScorecardService } from './validation/scorecard-service.js';
import { CandidateSelector } from './validation/candidate-selector.js';
import { DiffCollector } from './validation/diff-collector.js';

import { WebSocketGateway } from './server/ws-gateway.js';
import { makeAuthHook } from './server/auth-hook.js';
import { agentRoutes } from './server/routes/agents.js';
import { projectRoutes } from './server/routes/projects.js';
import { worktreeRoutes } from './server/routes/worktrees.js';
import { runRoutes } from './server/routes/runs.js';
import { dispatchRoutes } from './server/routes/dispatches.js';
import { validationRoutes } from './server/routes/validation.js';
import { registerGracefulShutdown } from './server/shutdown.js';
import { FixDecisionRepository, FixProposalRepository, FixWorkflowRepository } from './persistence/repositories/fix-repo.js';
import { FixProposalService } from './fix/proposal-service.js';
import { FixWorkflowService } from './fix/workflow-service.js';
import { fixProposalRoutes } from './fix/proposal-routes.js';
import { fixWorkflowRoutes } from './fix/workflow-routes.js';
import { RecoveryManager } from './recovery/recovery-manager.js';
import { InvestigationService } from './investigation/investigation-service.js';
import { investigationRoutes } from './investigation/routes.js';

const RUNTIME_AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN || randomBytes(24).toString('hex');
const PORT = parseInt(process.env.RELAY_PORT || '4400', 10);
if (process.env.RELAY_HOST && process.env.RELAY_HOST !== '127.0.0.1') {
  throw new Error('RELAY_HOST must remain 127.0.0.1; remote runtime binding is disabled');
}
const HOST = '127.0.0.1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

// ---- Persistence ----
const db = getDatabase();
runMigrations(db);
const recovery = new RecoveryManager(db).reconcile();
if (recovery.dispatchesMarkedFailed) console.warn('Recovered interrupted runtime work:', recovery);

const projectRepo = new ProjectRepository(db);
const runRepo = new RunRepository(db);
const taskRepo = new TaskRepository(db);
const dispatchRepo = new DispatchRepository(db);
const worktreeRepo = new WorktreeRepository(db);
const fixProposalRepo = new FixProposalRepository(db);
const fixWorkflowRepo = new FixWorkflowRepository(db);
const fixDecisionRepo = new FixDecisionRepository(db);
const investigationService = new InvestigationService(db);

// ---- Core services ----
const eventService = new EventService(db);
const processManager = new ProcessManager();
const wsGateway = new WebSocketGateway(processManager, eventService);

const validationService = new ValidationService(db, eventService, dispatchRepo, worktreeRepo);
const diffCollector = new DiffCollector();
const scorecardService = new ScorecardService(db, validationService, diffCollector);
const candidateSelector = new CandidateSelector(db, eventService, runRepo);

const coordinator = new RunCoordinator(
  runRepo,
  taskRepo,
  dispatchRepo,
  worktreeRepo,
  projectRepo,
  processManager,
  eventService,
  {
    // When an agent finishes successfully and the run has a validation
    // profile, run the same profile on its worktree automatically.
    onDispatchTerminal: (dispatchId, runId, status) => {
      const fixWorkflow=db.prepare('SELECT id FROM fix_workflows WHERE run_id=?').get(runId) as {id:string}|undefined;
      if (status !== 'succeeded') return;
      if(fixWorkflow)eventService.recordEvent({timestamp:new Date().toISOString(),type:'fix.candidate.ready_for_validation',runId,dispatchId,payload:{fixWorkflowId:fixWorkflow.id,status}});
      const run = runRepo.getById(runId);
      if (!run?.validationProfileId) return;
      validationService
        .runValidation(dispatchId, run.validationProfileId)
        .catch((err) => console.error(`Auto-validation failed for ${dispatchId}:`, err));
    },
  }
);

const fixProposalService = new FixProposalService(db, fixProposalRepo);
const fixWorkflowService = new FixWorkflowService(fixProposalRepo, fixWorkflowRepo, projectRepo, validationService, coordinator);

// ---- HTTP server ----
const server = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
});

await server.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/tests
    if (origin === ALLOWED_ORIGIN) return cb(null, true);
    return cb(new Error('CORS origin not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
});

await server.register(websocket);

const authHook = makeAuthHook(RUNTIME_AUTH_TOKEN);

// ---- Public endpoints ----
server.get('/api/v1/health', async () => ({
  data: {
    status: 'ok' as const,
    version: '0.1.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  },
  error: null,
}));

server.get('/api/v1/bootstrap', { preHandler: authHook }, async () => ({
  data: {
    authenticated: true,
    runtimeVersion: '0.1.0',
    nodeVersion: process.version,
    platform: process.platform,
  },
  error: null,
}));

// ---- Authenticated API routes ----
server.register(async (authed) => {
  authed.addHook('preHandler', authHook);
  await authed.register(agentRoutes);
  await authed.register(projectRoutes({ projectRepo, worktreeRepo }));
  await authed.register(worktreeRoutes({ worktreeRepo, projectRepo }));
  await authed.register(runRoutes({ coordinator, projectRepo }));
  await authed.register(dispatchRoutes({ coordinator, dispatchRepo, worktreeRepo }));
  await authed.register(validationRoutes({ validationService, scorecardService, candidateSelector }));
  await authed.register(fixProposalRoutes({ service: fixProposalService, proposals: fixProposalRepo, events:eventService }));
  await authed.register(fixWorkflowRoutes({ service: fixWorkflowService, proposals: fixProposalRepo, workflows: fixWorkflowRepo, decisions: fixDecisionRepo, candidateSelector, db, events:eventService }));
  await authed.register(investigationRoutes(investigationService));
});

// ---- WebSocket gateway with token validation ----
server.register(async (wsInstance) => {
  wsInstance.get('/ws/v1', { websocket: true }, (socket: WebSocket, req) => {
    if (req.headers.origin && req.headers.origin !== ALLOWED_ORIGIN) {
      socket.close(4003, 'Origin not allowed');
      return;
    }
    const url = new URL(req.url || '', `http://${HOST}:${PORT}`);
    const tokenQuery = url.searchParams.get('token');
    const authHeader = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const providedToken = tokenQuery || authHeader;

    if (!providedToken || providedToken !== RUNTIME_AUTH_TOKEN) {
      server.log.warn({ origin: req.headers.origin }, 'WebSocket connection rejected: invalid token');
      socket.send(
        JSON.stringify({
          type: 'runtime.error',
          sequence: 0,
          code: 'AUTH_REQUIRED',
          message: 'Invalid or missing auth token',
          recoverable: false,
          timestamp: new Date().toISOString(),
        })
      );
      socket.close(4001, 'Unauthorized');
      return;
    }

    server.log.info('WebSocket client connected');
    wsGateway.addClient(socket);
  });
});

// ---- Graceful shutdown ----
registerGracefulShutdown(server, db, processManager, wsGateway);

// ---- Start ----
try {
  await server.listen({ port: PORT, host: HOST });
  console.log('\n======================================================');
  console.log(` Relay Runtime Service running on http://${HOST}:${PORT}`);
  console.log(` WebSocket Gateway available at ws://${HOST}:${PORT}/ws/v1`);
  console.log(` Allowed origin: ${ALLOWED_ORIGIN}`);
  console.log(` Runtime Auth Token: ${RUNTIME_AUTH_TOKEN}`);
  console.log('======================================================\n');
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
