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

export const ROUNDS = {
  PRE_FLOP: 'PRE_FLOP',             // Round 1: Opening positions (Check, Bet)
  EVIDENCE_DROP: 'EVIDENCE_DROP',   // Round 2: Primary source filed (Call, Raise, Fold)
  CROSS_EXAM: 'CROSS_EXAM',         // Round 3: Counter-evidence / expert affidavits (Call, Re-Raise, Fold)
  SHOWDOWN: 'SHOWDOWN'              // Round 4: Locked for Civic Jury Attestation
};

export const POKER_ACTIONS = {
  CHECK: 'CHECK',
  BET: 'BET',
  CALL: 'CALL',
  RAISE: 'RAISE',
  FOLD: 'FOLD'
};

export const ROUND_SEQUENCE = [
  ROUNDS.PRE_FLOP,
  ROUNDS.EVIDENCE_DROP,
  ROUNDS.CROSS_EXAM,
  ROUNDS.SHOWDOWN
];

export const OPTION_TYPES = {
  PUT: 'PUT',     // Downside capital protection against adverse evidence drops / lost verdicts
  CALL: 'CALL'    // Leveraged upside commitment on specific epistemic outcomes
};

export class ValidationMarket {
  constructor() {
    this.markets = new Map();
    this.stakes = new Map();
    this.parleys = new Map();
    this.options = new Map();
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
      currentRound: ROUNDS.PRE_FLOP,
      roundIndex: 0,
      totalPool: initialBounty,
      outcomePools: {
        [OUTCOMES.VERIFIED]: 0,
        [OUTCOMES.DISPUTED]: 0,
        [OUTCOMES.MISINFORMED]: 0,
        [OUTCOMES.NEED_CONTEXT]: 0
      },
      roundWagers: {
        [ROUNDS.PRE_FLOP]: [],
        [ROUNDS.EVIDENCE_DROP]: [],
        [ROUNDS.CROSS_EXAM]: [],
        [ROUNDS.SHOWDOWN]: []
      },
      foldedStakers: new Set(),
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

  advanceRound(marketId) {
    if (!this.markets.has(marketId)) throw new Error(`Market not found: ${marketId}`);
    const market = this.markets.get(marketId);
    if (market.status !== 'OPEN') throw new Error(`Cannot advance round for market with status: ${market.status}`);
    
    if (market.roundIndex >= ROUND_SEQUENCE.length - 1) {
      throw new Error('Market is already at final round (SHOWDOWN)');
    }

    market.roundIndex += 1;
    market.currentRound = ROUND_SEQUENCE[market.roundIndex];
    return {
      marketId,
      currentRound: market.currentRound,
      roundIndex: market.roundIndex
    };
  }

  executePokerAction(params) {
    const { marketId, stakerDid, action, outcome, amount = 0 } = params;
    if (!this.markets.has(marketId)) throw new Error(`Market not found: ${marketId}`);
    const market = this.markets.get(marketId);
    if (market.status !== 'OPEN') throw new Error(`Market is ${market.status}, cannot execute action`);
    if (!POKER_ACTIONS[action]) throw new Error(`Invalid poker action: ${action}`);

    if (market.foldedStakers.has(stakerDid)) {
      throw new Error(`Staker ${stakerDid} has already folded in this market`);
    }

    if (market.currentRound === ROUNDS.SHOWDOWN && action !== POKER_ACTIONS.FOLD) {
      throw new Error('Market is in SHOWDOWN round; bets are locked awaiting jury verdict');
    }

    const currentWagers = market.roundWagers[market.currentRound];

    switch (action) {
      case POKER_ACTIONS.CHECK: {
        const record = {
          action: POKER_ACTIONS.CHECK,
          stakerDid,
          round: market.currentRound,
          timestamp: Date.now()
        };
        currentWagers.push(record);
        return record;
      }

      case POKER_ACTIONS.BET:
      case POKER_ACTIONS.CALL:
      case POKER_ACTIONS.RAISE: {
        if (!outcome || !OUTCOMES[outcome]) throw new Error(`A valid outcome is required for ${action}`);
        if (typeof amount !== 'number' || amount <= 0) throw new Error(`${action} amount must be positive`);

        const stakeReceipt = this.placeStake({ marketId, stakerDid, outcome, amount });
        const record = {
          action,
          stakerDid,
          outcome,
          amount,
          stakeId: stakeReceipt.stakeId,
          round: market.currentRound,
          timestamp: Date.now()
        };
        currentWagers.push(record);
        return record;
      }

      case POKER_ACTIONS.FOLD: {
        market.foldedStakers.add(stakerDid);
        const allStakes = this.stakes.get(marketId) || [];
        let forfeitedAmount = 0;
        for (const s of allStakes) {
          if (s.stakerDid === stakerDid) {
            s.folded = true;
            forfeitedAmount += s.amount;
          }
        }

        const foldReceipt = {
          action: POKER_ACTIONS.FOLD,
          stakerDid,
          round: market.currentRound,
          forfeitedAmount,
          savedFutureLiabilities: true,
          timestamp: Date.now()
        };
        currentWagers.push(foldReceipt);
        return foldReceipt;
      }

      default:
        throw new Error(`Unsupported poker action: ${action}`);
    }
  }

  createParley(params) {
    const { stakerDid, legs, stakeAmount } = params;
    if (!stakerDid) throw new Error('stakerDid is required for parley');
    if (!Array.isArray(legs) || legs.length < 2) {
      throw new Error('Parley ticket requires at least 2 distinct claim legs');
    }
    if (typeof stakeAmount !== 'number' || stakeAmount <= 0) {
      throw new Error('Parley stake amount must be a positive number');
    }

    const validatedLegs = [];
    let multipliedOdds = 1.0;
    const seenMarketIds = new Set();

    for (const leg of legs) {
      const { marketId, outcome } = leg;
      if (!this.markets.has(marketId)) throw new Error(`Market not found: ${marketId}`);
      if (!OUTCOMES[outcome]) throw new Error(`Invalid epistemic outcome: ${outcome}`);
      if (seenMarketIds.has(marketId)) {
        throw new Error(`Duplicate marketId ${marketId} in parley slip; legs must be independent claims`);
      }
      seenMarketIds.add(marketId);

      const market = this.markets.get(marketId);
      if (market.status !== 'OPEN') throw new Error(`Market ${marketId} is ${market.status}, cannot add to parley`);

      const oddsMap = this.calculateOdds(marketId);
      const legOdds = oddsMap[outcome] || 1.0;
      multipliedOdds = Math.round(multipliedOdds * legOdds * 100) / 100;

      validatedLegs.push({
        marketId,
        claimText: market.claimText,
        outcome,
        oddsAtPlacement: legOdds
      });
    }

    const parleyId = `parley_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const potentialPayout = Math.round(stakeAmount * multipliedOdds * 100) / 100;

    const parley = {
      parleyId,
      stakerDid,
      legs: validatedLegs,
      stakeAmount,
      multipliedOdds,
      potentialPayout,
      status: 'PENDING',
      createdAt: Date.now(),
      settledAt: null,
      payout: 0
    };

    this.parleys.set(parleyId, parley);
    return parley;
  }

  evaluateParley(parleyId) {
    if (!this.parleys.has(parleyId)) throw new Error(`Parley not found: ${parleyId}`);
    const parley = this.parleys.get(parleyId);

    if (parley.status !== 'PENDING') return parley;

    let allSettled = true;
    let allWon = true;

    for (const leg of parley.legs) {
      const market = this.markets.get(leg.marketId);
      if (market.status !== 'SETTLED') {
        allSettled = false;
        continue;
      }
      if (market.verdict !== leg.outcome) {
        allWon = false;
        parley.status = 'LOST';
        parley.settledAt = Date.now();
        parley.payout = 0;
        return parley;
      }
    }

    if (allSettled && allWon) {
      parley.status = 'WON';
      parley.settledAt = Date.now();
      parley.payout = parley.potentialPayout;
    }

    return parley;
  }

  getParleysForUser(userDid) {
    if (!userDid) return [];
    return Array.from(this.parleys.values()).filter(p => p.stakerDid === userDid);
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

  /**
   * Layer 2: Derivative Hedge Options Engine (PRD §5.3)
   * Purchases a derivative Put or Call option against claim resolution outcomes.
   */
  purchaseHedgeOption(params) {
    const { stakerDid, marketId, type, targetOutcome, notionalAmount, strikeOdds } = params;
    if (!stakerDid) throw new Error('stakerDid is required for hedge option');
    if (!this.markets.has(marketId)) throw new Error(`Market not found: ${marketId}`);
    if (!OPTION_TYPES[type]) throw new Error(`Invalid option type: ${type}`);
    if (!OUTCOMES[targetOutcome]) throw new Error(`Invalid target outcome: ${targetOutcome}`);
    if (typeof notionalAmount !== 'number' || notionalAmount <= 0) {
      throw new Error('Notional amount must be a positive number');
    }

    const market = this.markets.get(marketId);
    if (market.status !== 'OPEN') throw new Error(`Market is ${market.status}, cannot purchase hedge option`);

    const currentOddsMap = this.calculateOdds(marketId);
    const currentOdds = currentOddsMap[targetOutcome] || 1.0;
    const effectiveStrike = strikeOdds || currentOdds;

    // Premium formula:
    // PUT: capital protection premium based on inverse odds risk
    // CALL: leveraged upside premium based on notional call ratio
    const premium = type === OPTION_TYPES.PUT
      ? Math.max(1, Math.round((notionalAmount / Math.max(1.2, effectiveStrike)) * 0.15 * 100) / 100)
      : Math.max(1, Math.round((notionalAmount * 0.10) * 100) / 100);

    const optionId = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const option = {
      optionId,
      stakerDid,
      marketId,
      type,
      targetOutcome,
      notionalAmount,
      strikeOdds: effectiveStrike,
      premium,
      status: 'ACTIVE',
      createdAt: Date.now(),
      settledAt: null,
      payout: 0,
      netProfit: 0
    };

    this.options.set(optionId, option);
    return option;
  }

  /**
   * Resolves a derivative hedge option when the underlying market settles.
   */
  evaluateHedgeOption(optionId) {
    if (!this.options.has(optionId)) throw new Error(`Hedge option not found: ${optionId}`);
    const option = this.options.get(optionId);
    if (option.status !== 'ACTIVE') return option;

    const market = this.markets.get(option.marketId);
    if (market.status !== 'SETTLED') return option;

    option.settledAt = Date.now();

    if (option.type === OPTION_TYPES.PUT) {
      // Put pays out protected capital if the market settles AGAINST targetOutcome
      if (market.verdict !== option.targetOutcome) {
        option.status = 'EXERCISED';
        option.payout = option.notionalAmount;
        option.netProfit = Math.round((option.payout - option.premium) * 100) / 100;
      } else {
        option.status = 'EXPIRED';
        option.payout = 0;
        option.netProfit = -option.premium;
      }
    } else if (option.type === OPTION_TYPES.CALL) {
      // Call pays out leveraged upside if market settles FOR targetOutcome
      if (market.verdict === option.targetOutcome) {
        const finalOddsMap = this.calculateOdds(option.marketId);
        const finalOdds = finalOddsMap[option.targetOutcome] || option.strikeOdds;
        const multiplier = Math.max(1.5, finalOdds >= option.strikeOdds ? finalOdds : 1.5);
        option.status = 'EXERCISED';
        option.payout = Math.round(option.notionalAmount * multiplier * 100) / 100;
        option.netProfit = Math.round((option.payout - option.premium) * 100) / 100;
      } else {
        option.status = 'EXPIRED';
        option.payout = 0;
        option.netProfit = -option.premium;
      }
    }

    return option;
  }

  getHedgeOptionsForUser(userDid) {
    if (!userDid) return [];
    return Array.from(this.options.values()).filter(opt => opt.stakerDid === userDid);
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
    // Stakers who folded surrendered their funds to the pool and cannot win at showdown
    const winningStakes = allStakes.filter(s => s.outcome === finalVerdict && !s.folded && !market.foldedStakers?.has(s.stakerDid));

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

    // Auto-evaluate bound hedge options (PRD §5.3)
    const settledOptions = [];
    for (const [optId, opt] of this.options.entries()) {
      if (opt.marketId === marketId && opt.status === 'ACTIVE') {
        settledOptions.push(this.evaluateHedgeOption(optId));
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
      payouts,
      settledOptions
    };
  }
}
