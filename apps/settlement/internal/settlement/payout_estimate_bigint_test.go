package settlement

import (
	"context"
	"testing"

	"github.com/filspay/settlement/internal/money"
)

// Finance memo: high-volume lifetime totals must not drift. Integer fils
// additions stay exact past float32's 2^24 mantissa.
func TestUpdateLifetimePayoutMonitoringEstimate_LargeValuesExact(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	const step money.Fils = 20_000_000
	const times = 10
	for i := 0; i < times; i++ {
		if err := UpdateLifetimePayoutMonitoringEstimate(ctx, tx, merchantID, step); err != nil {
			t.Fatalf("UpdateLifetimePayoutMonitoringEstimate: %v", err)
		}
	}

	var got int64
	err = tx.QueryRow(ctx, `
		SELECT lifetime_net_payout_monitoring_estimate FROM merchants WHERE id = $1
	`, merchantID).Scan(&got)
	if err != nil {
		t.Fatalf("read back estimate: %v", err)
	}
	want := int64(step) * int64(times)
	if got != want {
		t.Fatalf("lifetime_net_payout_monitoring_estimate = %d, want %d", got, want)
	}
}
