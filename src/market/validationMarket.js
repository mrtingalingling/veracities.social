/**
 * Layer 1.1 / Layer 2: Validation Market Registry
 * Manages prediction pools, staking, dynamic odds, and settlement across Vera's 4 epistemic outcomes.
 */

export const OUTCOMES = {
  VERIFIED: 'VERIFIED',
  DISPUTED: 'DISPUTED',
  MISINFORMED: 'MISINFORMED',
  NEED_CONTEXT: 'NEED_CONTEXT'
};

export class ValidationMarket {
  constructor() {
    this.markets = new Map();
    this.stakes = new Map();
  }

  createMarket(params) {
    const { claimId, claimText, creatorDid, initialBounty = 0 } = params;
    if (!claimId || !claimText || !creatorDid) {
      throw new Error('claimId, claimText, and creatorDid are required to create a validation market');
    }

    const marketId = `market_${claimId}`;
    const market = {
      marketId,
      claimId,
      claimText,
      creatorDid,
      status: 'OPEN',
      totalPool: initialBounty,
      outcomePools: {
        [OUTCOMES.VERIFIED]: 0,
        [OUTCOMES.DISPUTED]: 0,
        [OUTCOMES.MISINFORMED]: 0,
        [OUTCOMES.NEED_CONTEXT]: 0
      },
      createdAt: Date.now(),
      verdict: null,
      settledAt: null
    };

    this.markets.set(marketId, market);
    this.stakes.set(marketId, []);
    return market;
  }

  placeStake(params) {
    const { marketId, stakerDid, outcome, amount } = params;
    if (!this.markets.has(marketId)) throw new Error(`Market not found: ${marketId}`);
    if (!OUTCOMES[outcome]) throw new Error(`Invalid epistemic outcome: ${outcome}`);
    if (typeof amount !== 'number' || amount <= 0) throw new Error('Stake amount must be a positive number');

    const market = this.markets.get(marketId);
    if (market.status !== 'OPEN') throw new Error(`Market is ${market.status}, cannot place stake`);

    market.outcomePools[outcome] += amount;
    market.totalPool += amount;

    const receipt = {
      stakeId: `stake_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      marketId,
      stakerDid,
      outcome,
      amount,
      timestamp: Date.now()
    };

    this.stakes.get(marketId).push(receipt);
    return receipt;
  }

  calculateOdds(marketId) {
    if (!this.markets.has(marketId)) throw new Error(`Market not found: ${marketId}`);
    const market = this.markets.get(marketId);
    const total = market.totalPool;

    const odds = {};
    for (const [outcome, pool] of Object.entries(market.outcomePools)) {
      odds[outcome] = total > 0 && pool > 0 
        ? Math.round((total / pool) * 100) / 100 
        : 1.0;
    }
    return odds;
  }

  settleMarket(marketId, finalVerdict, protocolFeePct = 0.05) {
    if (!this.markets.has(marketId)) throw new Error(`Market not found: ${marketId}`);
    if (!OUTCOMES[finalVerdict]) throw new Error(`Invalid final verdict: ${finalVerdict}`);

    const market = this.markets.get(marketId);
    if (market.status !== 'OPEN') throw new Error(`Market already ${market.status}`);

    market.status = 'SETTLED';
    market.verdict = finalVerdict;
    market.settledAt = Date.now();

    const winningPool = market.outcomePools[finalVerdict];
    const totalPool = market.totalPool;
    const allStakes = this.stakes.get(marketId) || [];
    const winningStakes = allStakes.filter(s => s.outcome === finalVerdict);

    const protocolCut = totalPool * protocolFeePct;
    const distributablePool = totalPool - protocolCut;

    const payouts = [];
    if (winningPool > 0) {
      for (const stake of winningStakes) {
        const share = stake.amount / winningPool;
        const payout = Math.round(share * distributablePool * 100) / 100;
        payouts.push({
          stakerDid: stake.stakerDid,
          originalStake: stake.amount,
          payout,
          profit: Math.round((payout - stake.amount) * 100) / 100
        });
      }
    }

    return {
      marketId,
      status: 'SETTLED',
      verdict: finalVerdict,
      totalPool,
      protocolCut,
      distributablePool,
      payouts
    };
  }
}
