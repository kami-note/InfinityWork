import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { hasPermission, verifyAccessToken, type AccessTokenClaims } from "@infinitywork/shared";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenClaims;
  }
}

const JWT_SECRET = process.env.JWT_SECRET!;

async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  try {
    request.user = await verifyAccessToken(authHeader.slice("Bearer ".length), JWT_SECRET);
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
}

/**
 * Every module validates the JWT locally with the shared secret instead of
 * calling the auth service on each request — that's what keeps a
 * distributed system cheap to run on a single VPS.
 */
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate("requireAuth", authenticate);
  app.decorate("requirePermission", (permission: string) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await authenticate(request, reply);
      if (reply.sent) return;
      if (!hasPermission(request.user!.permissions, permission)) {
        return reply.code(403).send({ error: "forbidden", required: permission });
      }
    };
  });
});

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: typeof authenticate;
    requirePermission: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
