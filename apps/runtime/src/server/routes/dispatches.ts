import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RunCoordinator } from '../../orchestration/run-coordinator.js';
import { DispatchRepository } from '../../persistence/repositories/dispatch-repo.js';
import { WorktreeRepository } from '../../persistence/repositories/worktree-repo.js';
import { worktreeService } from '../../git/worktree-service.js';

export interface DispatchRoutesDeps {
  coordinator: RunCoordinator;
  dispatchRepo: DispatchRepository;
  worktreeRepo: WorktreeRepository;
}

export const dispatchRoutes = (deps: DispatchRoutesDeps): FastifyPluginAsync => async (server) => {
  const { coordinator, dispatchRepo, worktreeRepo } = deps;

  server.get<{ Params: { id: string } }>('/api/v1/dispatches/:id', async (request, reply) => {
    const dispatch = dispatchRepo.getById(request.params.id);
    if (!dispatch) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Dispatch not found' },
      });
    }
    const worktree = worktreeRepo.getById(dispatch.worktreeId);
    return reply.send({ data: { ...dispatch, worktreePath: worktree?.path ?? null, branchName: worktree?.branchName ?? null }, error: null });
  });

  server.post<{ Params: { id: string } }>('/api/v1/dispatches/:id/input', async (request, reply) => {
    const schema = z.object({ input: z.string() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        data: null,
        error: { code: 'INVALID_INPUT', message: 'input string required' },
      });
    }

    try {
      await coordinator.sendInput(request.params.id, parsed.data.input);
      return reply.send({ data: { success: true }, error: null });
    } catch (err: any) {
      const code = /AGENT_CAPABILITY_UNSUPPORTED/.test(err.message)
        ? 'AGENT_CAPABILITY_UNSUPPORTED'
        : /DISPATCH_NOT_ACTIVE/.test(err.message)
          ? 'DISPATCH_NOT_ACTIVE'
          : 'INTERNAL_ERROR';
      return reply.status(400).send({ data: null, error: { code, message: err.message } });
    }
  });

  server.post<{ Params: { id: string } }>('/api/v1/dispatches/:id/stop', async (request, reply) => {
    try {
      await coordinator.stopDispatch(request.params.id);
      return reply.send({ data: { stopped: true }, error: null });
    } catch (err: any) {
      return reply.status(400).send({
        data: null,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  server.post<{ Params: { id: string } }>('/api/v1/dispatches/:id/retry', async (request, reply) => {
    try {
      const newDispatch = await coordinator.retryDispatch(request.params.id);
      return reply.status(201).send({ data: newDispatch, error: null });
    } catch (err: any) {
      return reply.status(400).send({
        data: null,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  server.get<{ Params: { id: string } }>('/api/v1/dispatches/:id/diff', async (request, reply) => {
    const dispatch = dispatchRepo.getById(request.params.id);
    if (!dispatch) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Dispatch not found' },
      });
    }

    const worktree = worktreeRepo.getById(dispatch.worktreeId);
    if (!worktree) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Worktree not found for dispatch' },
      });
    }

    try {
      const diff = await worktreeService.getWorktreeDiff(worktree.path, dispatch.baseCommit ?? worktree.baseCommit);
      return reply.send({ data: diff, error: null });
    } catch (err: any) {
      return reply.status(400).send({
        data: null,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });
};
