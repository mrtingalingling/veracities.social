/**
 * Protocol & Settlement Backend: Courtroom Settlement Protocol Rules
 * Governs cold-case refund math (94%/6%), challenge bond retrials,
 * and falsifiability gatekeeping criteria.
 */

export const SETTLEMENT_STATUS = {
  ACTIVE: 'ACTIVE',
  RESOLVED: 'RESOLVED',
  COLD: 'COLD',
  APPEALED: 'APPEALED'
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export class CourtroomSettlementProtocol {
  /**
   * Calculates stale cold case refund distribution after 14 days of inactivity.
   * Protocol rule: 94% refunded to stakers/depositors, 6% protocol maintenance fee retained.
   * @param {Object} params
   * @param {number} params.totalPool
   * @param {Array<{ depositorDid: string, amount: number }>} params.deposits
   * @param {number} params.lastActivityAt
   * @param {number} [params.currentTime=Date.now()]
   * @returns {Object} Settlement execution report
   */
  processColdCaseRefund(params) {
    const { totalPool, deposits = [], lastActivityAt, currentTime = Date.now() } = params;

    const elapsed = currentTime - lastActivityAt;
    if (elapsed < FOURTEEN_DAYS_MS) {
      return {
        isEligible: false,
        daysRemaining: Math.ceil((FOURTEEN_DAYS_MS - elapsed) / (24 * 3600 * 1000)),
        status: SETTLEMENT_STATUS.ACTIVE
      };
    }

    const platformFee = Math.round(totalPool * 0.06 * 100) / 100;
    const distributableRefund = Math.round((totalPool - platformFee) * 100) / 100;

    const refunds = deposits.map(dep => {
      const share = totalPool > 0 ? (dep.amount / totalPool) : 0;
      return {
        depositorDid: dep.depositorDid,
        originalDeposit: dep.amount,
        refundedAmount: Math.round(share * distributableRefund * 100) / 100
      };
    });

    return {
      isEligible: true,
      status: SETTLEMENT_STATUS.COLD,
      originalPool: totalPool,
      platformFeeRetainedPct: 6.0,
      platformFeeAmount: platformFee,
      totalRefundedAmount: distributableRefund,
      refunds
    };
  }

  /**
   * Calculates challenge bond appeal settlement.
   * - If overturned: challenger gets back full bond + 50% bounty reward.
   * - If reaffirmed: challenger forfeits bond to jury reward pool.
   * @param {Object} params
   * @param {string} params.challengerDid
   * @param {number} params.challengeBondAmount
   * @param {string} params.previousVerdict
   * @param {string} params.newVerdict
   * @returns {Object} Appeal settlement result
   */
  settleChallengeBond(params) {
    const { challengerDid, challengeBondAmount, previousVerdict, newVerdict } = params;

    if (typeof challengeBondAmount !== 'number' || challengeBondAmount <= 0) {
      throw new Error('Valid challenge bond amount required');
    }

    const isOverturned = newVerdict !== previousVerdict;

    if (isOverturned) {
      const bountyReward = Math.round(challengeBondAmount * 0.5 * 100) / 100;
      return {
        challengerDid,
        outcome: 'OVERTURNED',
        bondReturned: challengeBondAmount,
        bountyReward,
        totalPayout: challengeBondAmount + bountyReward,
        slashedToPool: 0
      };
    } else {
      return {
        challengerDid,
        outcome: 'REAFFIRMED',
        bondReturned: 0,
        bountyReward: 0,
        totalPayout: 0,
        slashedToPool: challengeBondAmount
      };
    }
  }

  /**
   * Tallies jury votes and checks for 2/3 (66.7%) decisive consensus threshold.
   * @param {Array<{ vote: 'AFFIRM'|'DENY'|'NEED_MORE_PROOF', weight?: number }>} votes 
   * @returns {Object}
   */
  evaluateJuryConsensus(votes = []) {
    let affirmWeight = 0;
    let denyWeight = 0;
    let needProofWeight = 0;
    let totalWeight = 0;

    for (const v of votes) {
      const w = v.weight || 1.0;
      if (v.vote === 'AFFIRM') affirmWeight += w;
      if (v.vote === 'DENY') denyWeight += w;
      if (v.vote === 'NEED_MORE_PROOF') needProofWeight += w;
      totalWeight += w;
    }

    const decisiveWeight = affirmWeight + denyWeight;
    const affirmPct = decisiveWeight > 0 ? (affirmWeight / decisiveWeight) * 100 : 0;
    const denyPct = decisiveWeight > 0 ? (denyWeight / decisiveWeight) * 100 : 0;

    const isConsensusReached = (affirmPct >= 66.7 || denyPct >= 66.7) && votes.length >= 2;

    let protocolVerdict = 'NEED_CONTEXT';
    if (isConsensusReached) {
      protocolVerdict = affirmPct >= 66.7 ? 'VERIFIED' : 'MISINFORMED';
    } else if (votes.length > 0 && needProofWeight > affirmWeight) {
      protocolVerdict = 'DISPUTED';
    }

    return {
      totalVotes: votes.length,
      totalWeight,
      affirmPct: Math.round(affirmPct * 10) / 10,
      denyPct: Math.round(denyPct * 10) / 10,
      isConsensusReached,
      protocolVerdict
    };
  }
}

export const courtroomSettlement = new CourtroomSettlementProtocol();
