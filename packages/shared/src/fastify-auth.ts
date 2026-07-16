import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { hasPermission } from "./permissions.js";
import { verifyAccessToken, type AccessTokenClaims } from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenClaims;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Every module validates the JWT locally with a shared secret instead of
 * calling the auth service on each request — that's what keeps a
 * distributed system cheap to run on a single VPS. Shared here because the
 * logic is identical across every backend module (file-manager, docs, ...).
 */
export function createAuthPlugin(jwtSecret: string) {
  async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    try {
      request.user = await verifyAccessToken(authHeader.slice("Bearer ".length), jwtSecret);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  }

  return fp(async (app: FastifyInstance) => {
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
}
