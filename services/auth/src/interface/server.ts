import Fastify from "fastify";
import cors from "@fastify/cors";
import { verifyAccessToken, hasPermission, PERMISSIONS } from "@infinitywork/shared";
import { loginSchema, refreshSchema } from "./schemas.js";
import {
  login,
  refresh,
  logout,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from "../application/auth-service.js";
import {
  findUserWithPermissionsById,
  findUserPublicByEmail,
} from "../infrastructure/user-repository.js";

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.PORTAL_ORIGIN ?? "http://portal:3000" });

app.get("/health", async () => ({ status: "ok" }));

app.post("/login", async (request, reply) => {
  const body = loginSchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "invalid_request", details: body.error.flatten() });

  try {
    const tokens = await login(body.data.email, body.data.password);
    return tokens;
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    throw err;
  }
});

app.post("/refresh", async (request, reply) => {
  const body = refreshSchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "invalid_request", details: body.error.flatten() });

  try {
    const tokens = await refresh(body.data.refreshToken);
    return tokens;
  } catch (err) {
    if (err instanceof InvalidRefreshTokenError) {
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }
    throw err;
  }
});

app.post("/logout", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return reply.code(401).send({ error: "unauthorized" });

  try {
    const claims = await verifyAccessToken(authHeader.slice("Bearer ".length), JWT_SECRET);
    await logout(claims.sub);
    return { status: "ok" };
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/me", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return reply.code(401).send({ error: "unauthorized" });

  try {
    const claims = await verifyAccessToken(authHeader.slice("Bearer ".length), JWT_SECRET);
    const user = await findUserWithPermissionsById(claims.sub);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return user;
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/users/search", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return reply.code(401).send({ error: "unauthorized" });

  try {
    const claims = await verifyAccessToken(authHeader.slice("Bearer ".length), JWT_SECRET);
    if (!hasPermission(claims.permissions, PERMISSIONS.users.user.lookup)) {
      return reply.code(403).send({ error: "forbidden", required: PERMISSIONS.users.user.lookup });
    }
    const email = (request.query as { email?: string }).email?.trim();
    if (!email) return reply.code(400).send({ error: "email_required" });
    const user = await findUserPublicByEmail(email);
    if (!user) return reply.code(404).send({ error: "not_found" });
    return user;
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

const port = Number(process.env.PORT ?? 4001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
