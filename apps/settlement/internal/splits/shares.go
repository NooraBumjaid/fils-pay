package splits

import "github.com/filspay/settlement/internal/money"

// ChildWeight is one sub-merchant's configured share of a parent's payout.
type ChildWeight struct {
	WeightBps int64
}

// ChildShares distributes netPayout across children by their weights.
// Independent per-child ApplyRateFils can leave a few fils unallocated;
// the remainder is applied to the last child so shares sum to the parent.
func ChildShares(netPayout money.Fils, children []ChildWeight) []money.Fils {
	out := make([]money.Fils, len(children))
	var allocated money.Fils
	for i, c := range children {
		out[i] = money.ApplyRateFils(netPayout, c.WeightBps)
		allocated += out[i]
	}
	if rem := netPayout - allocated; rem != 0 && len(out) > 0 {
		out[len(out)-1] += rem
	}
	return out
}
