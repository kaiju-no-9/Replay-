import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ValidationService } from '../../validation/validation-service.js';
import { ScorecardService } from '../../validation/scorecard-service.js';
import { CandidateSelector } from '../../validation/candidate-selector.js';

export interface ValidationRoutesDeps {
  validationService: ValidationService;
  scorecardService: ScorecardService;
  candidateSelector: CandidateSelector;
}

export const validationRoutes = (deps: ValidationRoutesDeps): FastifyPluginAsync => async (server) => {
  const { validationService, scorecardService, candidateSelector } = deps;

  server.get<{ Params: { id: string } }>(
    '/api/v1/projects/:id/validation-profiles',
    async (request, reply) => {
      const profiles = validationService.getProfilesForProject(request.params.id);
      return reply.send({ data: profiles, error: null });
    }
  );

  server.post<{ Params: { id: string } }>(
    '/api/v1/projects/:id/validation-profiles',
    async (request, reply) => {
      const schema = z.object({
        name: z.string().min(1),
        commands: z
          .array(
            z.object({
              label: z.string().min(1),
              executable: z.string().min(1),
              args: z.array(z.string()),
              timeoutMs: z.number().int().positive().default(60_000),
            })
          )
          .min(1),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          data: null,
          error: { code: 'INVALID_INPUT', message: 'Invalid validation profile payload' },
        });
      }

      const profile = validationService.createProfile(
        request.params.id,
        parsed.data.name,
        parsed.data.commands
      );
      return reply.status(201).send({ data: profile, error: null });
    }
  );

  server.post<{ Params: { id: string } }>(
    '/api/v1/dispatches/:id/validate',
    async (request, reply) => {
      const schema = z.object({ profileId: z.string().uuid() });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          data: null,
          error: { code: 'INVALID_INPUT', message: 'profileId is required' },
        });
      }

      try {
        const results = await validationService.runValidation(request.params.id, parsed.data.profileId);
        return reply.send({ data: results, error: null });
      } catch (err: any) {
        return reply.status(400).send({
          data: null,
          error: { code: 'INTERNAL_ERROR', message: err.message },
        });
      }
    }
  );

  server.get<{ Params: { id: string } }>(
    '/api/v1/dispatches/:id/validation-results',
    async (request, reply) => {
      const results = validationService.getResultsForDispatch(request.params.id);
      return reply.send({ data: results, error: null });
    }
  );

  server.get<{ Params: { id: string } }>('/api/v1/runs/:id/scorecard', async (request, reply) => {
    try {
      const scorecard = await scorecardService.generateScorecard(request.params.id);
      return reply.send({ data: scorecard, error: null });
    } catch (err: any) {
      return reply.status(404).send({
        data: null,
        error: { code: 'NOT_FOUND', message: err.message },
      });
    }
  });

  server.post<{ Params: { id: string } }>(
    '/api/v1/runs/:id/select-candidate',
    async (request, reply) => {
      const schema = z.object({ dispatchId: z.string().uuid() });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          data: null,
          error: { code: 'INVALID_INPUT', message: 'dispatchId is required' },
        });
      }

      try {
        candidateSelector.selectCandidate(request.params.id, parsed.data.dispatchId);
        return reply.send({
          data: { success: true, selectedDispatchId: parsed.data.dispatchId },
          error: null,
        });
      } catch (err: any) {
        return reply.status(400).send({
          data: null,
          error: { code: 'INTERNAL_ERROR', message: err.message },
        });
      }
    }
  );
};
