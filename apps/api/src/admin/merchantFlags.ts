import type { PoolClient } from "pg";

/** Inspects sandbox merchants. Never clears test_mode — that enrolled them in live settlement. */
export async function reconcileSandboxFlag(
  _client: PoolClient,
  _merchantId: string,
  _summary: { scanned: number; openAuthorizations: number },
): Promise<string[]> {
  return [];
}
