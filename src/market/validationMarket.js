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

  settleMarket(marketId, finalVerdict, options = {}) {
    if (!this.markets.has(marketId)) throw new Error(`Market not found: ${marketId}`);
    if (!OUTCOMES[finalVerdict]) throw new Error(`Invalid final verdict: ${finalVerdict}`);

    const market = this.markets.get(marketId);
    if (market.status !== 'OPEN') throw new Error(`Market already ${market.status}`);

    const protocolFeePct = typeof options === 'number' ? options : (options.protocolFeePct ?? 0.05);
    const evidenceBountyPct = typeof options === 'object' ? (options.evidenceBountyPct ?? 0.15) : 0;
    const jurorFeePct = typeof options === 'object' ? (options.jurorFeePct ?? 0.05) : 0;
    const decisiveEvidenceContributorDid = typeof options === 'object' ? options.decisiveEvidenceContributorDid : null;
    const participatingJurorDids = typeof options === 'object' && Array.isArray(options.participatingJurorDids) ? options.participatingJurorDids : [];

    market.status = 'SETTLED';
    market.verdict = finalVerdict;
    market.settledAt = Date.now();

    const winningPool = market.outcomePools[finalVerdict];
    const totalPool = market.totalPool;
    const losingPool = Math.max(0, totalPool - winningPool);
    const allStakes = this.stakes.get(marketId) || [];
    const winningStakes = allStakes.filter(s => s.outcome === finalVerdict);

    const protocolCut = Math.round(totalPool * protocolFeePct * 100) / 100;

    // Slashing losing pool to reward empirical evidence contributor (whistleblower) and civic jurors
    let evidenceBounty = 0;
    if (decisiveEvidenceContributorDid && losingPool > 0 && evidenceBountyPct > 0) {
      evidenceBounty = Math.round(losingPool * evidenceBountyPct * 100) / 100;
    }

    let jurorFeePool = 0;
    if (participatingJurorDids.length > 0 && losingPool > 0 && jurorFeePct > 0) {
      jurorFeePool = Math.round(losingPool * jurorFeePct * 100) / 100;
    }

    const netDeductions = protocolCut + evidenceBounty + jurorFeePool;
    const distributablePool = Math.max(0, Math.round((totalPool - netDeductions) * 100) / 100);

    const payouts = [];
    if (winningPool > 0) {
      for (const stake of winningStakes) {
        const share = stake.amount / winningPool;
        const payout = Math.round(share * distributablePool * 100) / 100;
        payouts.push({
          recipientDid: stake.stakerDid,
          stakerDid: stake.stakerDid,
          type: 'WINNING_STAKE',
          originalStake: stake.amount,
          payout,
          profit: Math.round((payout - stake.amount) * 100) / 100
        });
      }
    }

    // Evidence Bounty Line Item
    if (evidenceBounty > 0 && decisiveEvidenceContributorDid) {
      payouts.push({
        recipientDid: decisiveEvidenceContributorDid,
        type: 'EVIDENCE_BOUNTY',
        bountyRole: 'Whistleblower / Primary Evidence Contributor',
        payout: evidenceBounty,
        profit: evidenceBounty
      });
    }

    // Juror Deliberation Fee Line Items
    if (jurorFeePool > 0 && participatingJurorDids.length > 0) {
      const perJurorFee = Math.round((jurorFeePool / participatingJurorDids.length) * 100) / 100;
      for (const jurorDid of participatingJurorDids) {
        payouts.push({
          recipientDid: jurorDid,
          type: 'JUROR_DELIBERATION_FEE',
          bountyRole: 'Summoned Civic Juror',
          payout: perJurorFee,
          profit: perJurorFee
        });
      }
    }

    return {
      marketId,
      status: 'SETTLED',
      verdict: finalVerdict,
      totalPool,
      losingPool,
      protocolCut,
      evidenceBounty,
      jurorFeePool,
      distributablePool,
      payouts
    };
  }
}
