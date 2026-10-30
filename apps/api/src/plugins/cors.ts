import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

/** Reflects an allow-listed Origin so the Vite dashboard/admin/checkout
 *  can send session cookies to the API without a same-origin reverse proxy. */
export const corsPlugin = fp(async (app: FastifyInstance): Promise<void> => {
  const allowed = new Set(app.config.corsOrigins);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) return;

    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Headers", "content-type, idempotency-key, authorization");
    reply.header("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS");

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });
});
