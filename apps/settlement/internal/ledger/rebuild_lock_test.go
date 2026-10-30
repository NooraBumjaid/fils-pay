package ledger

import (
	"context"
	"testing"
)

// Confirms the SHARE ROW EXCLUSIVE lock does not break the existing
// rebuild path: CloseBatch's incremental update must wait, not clobber.
func TestRebuildAllBalances_LockDoesNotChangeRecompute(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool)
	postLedgerLeg(t, pool, merchantID, "credit", 12_000)
	postLedgerLeg(t, pool, merchantID, "debit", 250)

	diffs, err := RebuildAllBalances(context.Background(), pool)
	if err != nil {
		t.Fatalf("RebuildAllBalances: %v", err)
	}
	diff, ok := diffs[merchantID]
	if !ok {
		t.Fatalf("RebuildAllBalances omitted merchant %s", merchantID)
	}
	if int64(diff.Rebuilt) != 11_750 {
		t.Errorf("rebuilt = %d, want 11750", diff.Rebuilt)
	}
}
