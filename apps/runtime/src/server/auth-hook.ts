import { FastifyReply, FastifyRequest } from 'fastify';

export function makeAuthHook(token: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const provided = authHeader?.replace(/^Bearer\s+/i, '') ?? (request.query as any)?.token;

    if (!provided || provided !== token) {
      reply.status(401).send({
        data: null,
        error: { code: 'AUTH_REQUIRED', message: 'Valid Bearer token required' },
      });
      return reply;
    }
  };
}
