import { useState } from "react";
import { request } from "../../api/client.js";
import { describeError } from "../../api/client.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { bhd } from "../../format.js";
import type { TransactionDto } from "../../types.js";

interface RefundResponse {
  id: string;
  transactionId: string;
  amountFils: number;
  feeReversedFils: number;
  transactionStatus: string;
  refundedTotalFils: number;
}

interface RefundDrawerProps {
  txn: TransactionDto;
  onRefunded: () => Promise<void>;
}

export function RefundDrawer({ txn, onRefunded }: RefundDrawerProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refundableFils = txn.capturedFils - txn.refundedFils;
  const refundableStatus = ["captured", "partially_captured", "partially_refunded"].includes(txn.status);

  async function handleRefund(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!window.confirm("Refund this transaction? The money goes back to the cardholder.")) return;

    setSubmitting(true);
    setError(null);
    try {
      const trimmed = amount.trim();
      const body = trimmed === "" ? { transactionId: txn.id } : { transactionId: txn.id, amountFils: Number(trimmed) };
      await request<RefundResponse>("/v1/refunds", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      setOpen(false);
      setAmount("");
      await onRefunded();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!refundableStatus || refundableFils <= 0) return null;

  return (
    <RequireRole allow={["owner", "finance"]}>
      <div className="dash-actions">
        {error ? <p className="dash-error">{error}</p> : null}
        {open ? (
          <form className="dash-form dash-form-inline" onSubmit={(e) => void handleRefund(e)}>
            <label>
              Amount in fils (blank refunds all {refundableFils} refundable fils)
              <input
                type="number"
                min={1}
                max={refundableFils}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <p className="dash-muted">Captured: {bhd(txn.capturedFils)} · Already refunded: {bhd(txn.refundedFils)}</p>
            <button type="submit" className="dash-button" disabled={submitting}>
              {submitting ? "Refunding..." : "Refund"}
            </button>
            <button type="button" className="dash-button" disabled={submitting} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="dash-button" onClick={() => setOpen(true)}>
            Refund
          </button>
        )}
      </div>
    </RequireRole>
  );
}
