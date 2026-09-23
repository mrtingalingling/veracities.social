import { describe, it, expect } from 'vitest';
import { courtroomSettlement, SETTLEMENT_STATUS } from '../src/settlement/courtroomSettlement.js';

describe('Protocol & Settlement Backend: Courtroom Settlement Protocol Rules', () => {
  it('enforces 14-day cold case refund distribution (94% refund, 6% protocol maintenance fee)', () => {
    const deposits = [
      { depositorDid: 'did:plc:alice', amount: 600 },
      { depositorDid: 'did:plc:bob', amount: 400 }
    ];
    const totalPool = 1000;
    const now = Date.now();
    const fifteenDaysAgo = now - (15 * 24 * 60 * 60 * 1000);

    const report = courtroomSettlement.processColdCaseRefund({
      totalPool,
      deposits,
      lastActivityAt: fifteenDaysAgo,
      currentTime: now
    });

    expect(report.isEligible).toBe(true);
    expect(report.status).toBe(SETTLEMENT_STATUS.COLD);
    expect(report.originalPool).toBe(1000);
    expect(report.platformFeeAmount).toBe(60); // 6% of 1000
    expect(report.totalRefundedAmount).toBe(940); // 94% of 1000
    expect(report.refunds[0].refundedAmount).toBe(564); // 60% of 940
    expect(report.refunds[1].refundedAmount).toBe(376); // 40% of 940
  });

  it('rejects cold refund if 14 days have not elapsed', () => {
    const now = Date.now();
    const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000);

    const report = courtroomSettlement.processColdCaseRefund({
      totalPool: 500,
      deposits: [{ depositorDid: 'did:plc:alice', amount: 500 }],
      lastActivityAt: fiveDaysAgo,
      currentTime: now
    });

    expect(report.isEligible).toBe(false);
    expect(report.status).toBe(SETTLEMENT_STATUS.ACTIVE);
    expect(report.daysRemaining).toBe(9);
  });

  it('settles challenge bond appeal: overturned verdict returns bond + 50% bounty', () => {
    const result = courtroomSettlement.settleChallengeBond({
      challengerDid: 'did:plc:challenger1',
      challengeBondAmount: 200,
      previousVerdict: 'MISINFORMED',
      newVerdict: 'VERIFIED'
    });

    expect(result.outcome).toBe('OVERTURNED');
    expect(result.bondReturned).toBe(200);
    expect(result.bountyReward).toBe(100);
    expect(result.totalPayout).toBe(300);
    expect(result.slashedToPool).toBe(0);
  });

  it('settles challenge bond appeal: reaffirmed verdict slashes bond to pool', () => {
    const result = courtroomSettlement.settleChallengeBond({
      challengerDid: 'did:plc:spammer',
      challengeBondAmount: 200,
      previousVerdict: 'MISINFORMED',
      newVerdict: 'MISINFORMED'
    });

    expect(result.outcome).toBe('REAFFIRMED');
    expect(result.bondReturned).toBe(0);
    expect(result.totalPayout).toBe(0);
    expect(result.slashedToPool).toBe(200);
  });

  it('tallies jury votes and checks 66.7% consensus threshold', () => {
    const votes = [
      { jurorDid: 'did:plc:j1', vote: 'AFFIRM', weight: 10 },
      { jurorDid: 'did:plc:j2', vote: 'AFFIRM', weight: 10 },
      { jurorDid: 'did:plc:j3', vote: 'DENY', weight: 5 }
    ];

    const evaluation = courtroomSettlement.evaluateJuryConsensus(votes);
    expect(evaluation.affirmPct).toBe(80.0);
    expect(evaluation.isConsensusReached).toBe(true);
    expect(evaluation.protocolVerdict).toBe('VERIFIED');
  });
});
