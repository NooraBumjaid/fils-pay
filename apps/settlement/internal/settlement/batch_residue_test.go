package settlement

import (
	"context"
	"testing"
	"time"

	"github.com/filspay/settlement/internal/money"
)

// ADR-0002: CloseBatch must journal the truncated gap per scheme line.
func TestCloseBatch_JournalsSchemeLineResidue(t *testing.T) {
	pool := mustPool(t)
	const mdrBps = 250
	merchantID := insertActiveMerchant(t, pool, mdrBps)
	businessDate := time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(businessDate)

	txnID, _ := insertCaptureEvent(t, pool, merchantID, mdrBps, 4747, start.Add(time.Hour))

	result, err := CloseBatch(context.Background(), pool, merchantID, businessDate)
	if err != nil {
		t.Fatalf("CloseBatch: %v", err)
	}

	var residueDebit, residueCredit int64
	err = pool.QueryRow(context.Background(), `
		SELECT
		  COALESCE(SUM(CASE WHEN account_id = 'scheme_rounding_residue' AND direction = 'debit' THEN amount_fils END), 0),
		  COALESCE(SUM(CASE WHEN account_id = 'card_scheme_clearing' AND direction = 'credit' THEN amount_fils END), 0)
		FROM ledger_entries
		WHERE settlement_batch_id = $1 AND transaction_id = $2
		  AND description = 'scheme rounding residue'
	`, result.BatchID, txnID).Scan(&residueDebit, &residueCredit)
	if err != nil {
		t.Fatalf("query residue legs: %v", err)
	}
	if residueDebit != 7 || residueCredit != 7 {
		t.Errorf("residue debit/credit = %d/%d, want 7/7 (4747 truncated to 4740)", residueDebit, residueCredit)
	}
}

func TestCloseBatch_SkipsResidueWhenAmountAlreadyTruncated(t *testing.T) {
	pool := mustPool(t)
	const mdrBps = 250
	merchantID := insertActiveMerchant(t, pool, mdrBps)
	businessDate := time.Date(2026, 3, 25, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(businessDate)

	insertCaptureEvent(t, pool, merchantID, mdrBps, 4750, start.Add(time.Hour))

	result, err := CloseBatch(context.Background(), pool, merchantID, businessDate)
	if err != nil {
		t.Fatalf("CloseBatch: %v", err)
	}

	var residueCount int
	err = pool.QueryRow(context.Background(), `
		SELECT count(*) FROM ledger_entries
		 WHERE settlement_batch_id = $1 AND description = 'scheme rounding residue'
	`, result.BatchID).Scan(&residueCount)
	if err != nil {
		t.Fatalf("query residue count: %v", err)
	}
	if residueCount != 0 {
		t.Errorf("residue legs = %d, want 0 for an already-truncated 4750 fils line", residueCount)
	}
}

func TestTruncateToSchemeAmount_ResidueIsGrossMinusTruncated(t *testing.T) {
	gross := money.Fils(4747)
	truncated := TruncateToSchemeAmount(gross)
	if truncated != 4740 {
		t.Fatalf("truncated = %d, want 4740", truncated)
	}
	if gross-truncated != 7 {
		t.Fatalf("residue = %d, want 7", gross-truncated)
	}
}
