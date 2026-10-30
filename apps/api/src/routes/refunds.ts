import type { FastifyInstance } from "fastify";
import { toFils } from "@filspay/money";
import {
  requireMerchantAuth,
  requireMerchantRole,
  requireMerchantWriterActor,
} from "../auth/requireMerchantAuth.js";
import { BadRequestError } from "../lib/errors.js";
import { initiateMerchantRefund } from "../refunds/initiateMerchantRefund.js";

interface RefundBody {
  transactionId?: unknown;
  amountFils?: unknown;
  reason?: unknown;
}

function refundIdempotencyKey(header: string | string[] | undefined): string {
  const key = Array.isArray(header) ? header[0] : header;
  if (!key) throw new BadRequestError("idempotency_key_required", "Idempotency-Key header is required");
  return key;
}

export async function refundRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RefundBody }>(
    "/",
    { preHandler: [requireMerchantAuth, requireMerchantRole("owner", "finance")] },
    async (request, reply) => {
      const body = request.body ?? {};
      if (
        typeof body.transactionId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.transactionId)
      ) {
        throw new BadRequestError("invalid_transaction_id", "transactionId must be a UUID");
      }
      if (
        body.amountFils !== undefined &&
        (typeof body.amountFils !== "number" || !Number.isSafeInteger(body.amountFils) || body.amountFils <= 0)
      ) {
        throw new BadRequestError("invalid_refund_amount", "amountFils must be a positive safe integer");
      }
      if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 200)) {
        throw new BadRequestError("invalid_refund_reason", "reason must be a string of at most 200 characters");
      }

      const auth = request.merchantAuth!;
      const result = await initiateMerchantRefund(app.db, app.acquirer, {
        merchantId: auth.merchantId,
        transactionId: body.transactionId,
        amountFils: body.amountFils === undefined ? undefined : toFils(body.amountFils),
        idempotencyKey: refundIdempotencyKey(request.headers["idempotency-key"]),
        actor: requireMerchantWriterActor(auth),
        reason: body.reason as string | undefined,
      });
      reply.code(result.statusCode).send(result.body);
    },
  );
}
