import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { worktreeService } from '../../git/worktree-service.js';
import { WorktreeRepository } from '../../persistence/repositories/worktree-repo.js';
import { ProjectRepository } from '../../persistence/repositories/project-repo.js';

export interface WorktreeRoutesDeps {
  worktreeRepo: WorktreeRepository;
  projectRepo: ProjectRepository;
}

export const worktreeRoutes = (deps: WorktreeRoutesDeps): FastifyPluginAsync => async (server) => {
  const { worktreeRepo, projectRepo } = deps;

  server.get<{ Params: { id: string } }>('/api/v1/worktrees/:id', async (request, reply) => {
    const wt = worktreeRepo.getById(request.params.id);
    if (!wt) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Worktree not found' },
      });
    }
    return reply.send({ data: wt, error: null });
  });

  server.get<{ Params: { id: string } }>('/api/v1/worktrees/:id/diff', async (request, reply) => {
    const wt = worktreeRepo.getById(request.params.id);
    if (!wt) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Worktree not found' },
      });
    }

    try {
      const diff = await worktreeService.getWorktreeDiff(wt.path, wt.baseCommit);
      return reply.send({ data: diff, error: null });
    } catch (err: any) {
      return reply.status(400).send({
        data: null,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  server.post<{ Params: { id: string } }>('/api/v1/worktrees/:id/keep', async (request, reply) => {
    const wt = worktreeRepo.getById(request.params.id);
    if (!wt) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Worktree not found' },
      });
    }

    worktreeRepo.setKept(wt.id, true);
    return reply.send({ data: { kept: true }, error: null });
  });

  server.post<{ Params: { id: string }; Body: { force?: boolean } }>(
    '/api/v1/worktrees/:id/cleanup',
    async (request, reply) => {
      const wt = worktreeRepo.getById(request.params.id);
      if (!wt) {
        return reply.status(404).send({
          data: null,
          error: { code: 'NOT_FOUND', message: 'Worktree not found' },
        });
      }

      const body = z.object({ force: z.boolean().optional() }).safeParse(request.body ?? {});
      const force = body.success ? (body.data.force ?? false) : false;

      const project = projectRepo.getById(wt.projectId);
      if (!project) {
        return reply.status(404).send({
          data: null,
          error: { code: 'NOT_FOUND', message: 'Project not found for worktree' },
        });
      }

      try {
        const result = await worktreeService.cleanupWorktree(project.repoPath, wt.path, force);
        worktreeRepo.updateStatus(wt.id, 'removed', null);
        return reply.send({ data: result, error: null });
      } catch (err: any) {
        const isDirty = /uncommitted change/i.test(err.message);
        return reply.status(isDirty ? 409 : 500).send({
          data: null,
          error: {
            code: isDirty ? 'WORKTREE_DIRTY' : 'INTERNAL_ERROR',
            message: err.message,
            details: { requiresForce: isDirty },
          },
        });
      }
    }
  );
};
