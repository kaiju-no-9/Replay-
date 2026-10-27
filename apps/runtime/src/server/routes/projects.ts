import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { gitService } from '../../git/git-service.js';
import { ProjectRepository } from '../../persistence/repositories/project-repo.js';
import { WorktreeRepository } from '../../persistence/repositories/worktree-repo.js';

export interface ProjectRoutesDeps {
  projectRepo: ProjectRepository;
  worktreeRepo: WorktreeRepository;
}

export const projectRoutes = (deps: ProjectRoutesDeps): FastifyPluginAsync => async (server) => {
  const { projectRepo, worktreeRepo } = deps;

  server.post('/api/v1/projects', async (request, reply) => {
    const body = z.object({ repoPath: z.string().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        data: null,
        error: { code: 'INVALID_INPUT', message: 'repoPath is required' },
      });
    }

    try {
      const canonical = fs.realpathSync(path.resolve(body.data.repoPath));
      const gitInfo = await gitService.getRepoInfo(canonical);

      const existing = projectRepo.getByRepoPath(gitInfo.root);
      if (existing) {
        return reply.send({ data: { ...existing, gitInfo }, error: null });
      }

      const now = new Date().toISOString();
      const project = {
        id: crypto.randomUUID(),
        name: path.basename(gitInfo.root),
        repoPath: gitInfo.root,
        defaultBranch: gitInfo.currentBranch || 'main',
        createdAt: now,
        updatedAt: now,
      };

      projectRepo.create(project);
      return reply.status(201).send({ data: { ...project, gitInfo }, error: null });
    } catch (err: any) {
      return reply.status(400).send({
        data: null,
        error: { code: 'NOT_A_GIT_REPOSITORY', message: err.message },
      });
    }
  });

  server.get('/api/v1/projects', async (_request, reply) => {
    return reply.send({ data: projectRepo.list(), error: null });
  });

  server.get<{ Params: { id: string } }>('/api/v1/projects/:id', async (request, reply) => {
    const project = projectRepo.getById(request.params.id);
    if (!project) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    let gitInfo = null;
    try {
      gitInfo = await gitService.getRepoInfo(project.repoPath);
    } catch {
      // Repo may be temporarily unavailable
    }

    return reply.send({ data: { ...project, gitInfo }, error: null });
  });

  server.get<{ Params: { id: string } }>('/api/v1/projects/:id/worktrees', async (request, reply) => {
    const project = projectRepo.getById(request.params.id);
    if (!project) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    const worktrees = worktreeRepo.listByProject(project.id);
    return reply.send({ data: worktrees, error: null });
  });
};
