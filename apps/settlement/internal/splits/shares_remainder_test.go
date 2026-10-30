package splits

import (
	"testing"

	"github.com/filspay/settlement/internal/money"
)

func TestChildShares_RemainderGoesToLastChild(t *testing.T) {
	net := money.Fils(100)
	shares := ChildShares(net, []ChildWeight{{3333}, {3333}, {3334}})
	var total money.Fils
	for _, s := range shares {
		total += s
	}
	if total != net {
		t.Fatalf("sum of shares %d != net payout %d (shares=%v)", total, net, shares)
	}
}
