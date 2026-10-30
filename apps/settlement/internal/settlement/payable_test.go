package settlement

import (
	"testing"

	"github.com/filspay/settlement/internal/money"
)

func TestNetPayableFilsIsExactForLargeFilsAmounts(t *testing.T) {
	const gross = money.Fils(25_000_007)
	const fee = money.Fils(1_234_567)
	if got, want := NetPayableFils(gross, fee), money.Fils(23_765_440); got != want {
		t.Fatalf("NetPayableFils(%d, %d) = %d, want %d", gross, fee, got, want)
	}
}

func TestNetPayableFilsSupportsRefundAdjustments(t *testing.T) {
	if got, want := NetPayableFils(0, -250)-2_000, money.Fils(-1_750); got != want {
		t.Fatalf("refund-adjusted net = %d, want %d", got, want)
	}
}
