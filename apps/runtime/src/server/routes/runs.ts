import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RunCoordinator } from '../../orchestration/run-coordinator.js';
import { ProjectRepository } from '../../persistence/repositories/project-repo.js';
import { AgentId } from '../../agents/types.js';

export interface RunRoutesDeps {
  coordinator: RunCoordinator;
  projectRepo: ProjectRepository;
}

export const runRoutes = (deps: RunRoutesDeps): FastifyPluginAsync => async (server) => {
  const { coordinator, projectRepo } = deps;

  server.post('/api/v1/runs', async (request, reply) => {
    const schema = z.object({
      projectId: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      objective: z.string().min(1),
      prompt: z.string().min(1).optional(),
      agentIds: z.array(z.string()).min(1),
      concurrencyLimit: z.number().int().min(1).max(5).optional(),
      validationProfileId: z.string().uuid().nullable().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        data: null,
        error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Invalid run payload' },
      });
    }

    const body = parsed.data;
    const project = projectRepo.getById(body.projectId);
    if (!project) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    const objective = body.objective || body.prompt || '';

    try {
      const result = await coordinator.createRun({
        projectId: project.id,
        projectRoot: project.repoPath,
        title: body.title ?? objective.slice(0, 60),
        objective,
        agentIds: body.agentIds as AgentId[],
        concurrencyLimit: body.concurrencyLimit,
        validationProfileId: body.validationProfileId ?? null,
      });
      return reply.status(201).send({ data: result, error: null });
    } catch (err: any) {
      const isAgentMissing = /AGENT_NOT_INSTALLED/.test(err.message);
      return reply.status(400).send({
        data: null,
        error: {
          code: isAgentMissing ? 'AGENT_NOT_INSTALLED' : 'INTERNAL_ERROR',
          message: err.message,
        },
      });
    }
  });

  server.get('/api/v1/runs', async (_request, reply) => {
    return reply.send({ data: coordinator.listRuns(), error: null });
  });

  server.get<{ Params: { id: string } }>('/api/v1/runs/:id', async (request, reply) => {
    const runData = coordinator.getRun(request.params.id);
    if (!runData) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Run not found' },
      });
    }
    return reply.send({ data: runData, error: null });
  });

  server.post<{ Params: { id: string } }>('/api/v1/runs/:id/cancel', async (request, reply) => {
    try {
      await coordinator.cancelRun(request.params.id);
      return reply.send({ data: { cancelled: true }, error: null });
    } catch (err: any) {
      return reply.status(400).send({
        data: null,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });
};
