import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationMarket, OUTCOMES } from '../src/market/validationMarket.js';
import { CourtroomSettlementProtocol, SETTLEMENT_STATUS } from '../src/settlement/courtroomSettlement.js';
import { verdictAttestationService } from '../src/attestation/verdictAttestation.js';

describe('Validation Market, Escrow & Oracle Attestation Flow', () => {
  let market;
  let settlement;
  const caseId = 'case_fusion_q_breakeven';
  const claimText = 'Net energy gain Q > 1.0 achieved in magnetic confinement fusion in Q1 2024.';
  const creatorDid = 'did:plc:bob_physics';

  beforeEach(() => {
    market = new ValidationMarket();
    settlement = new CourtroomSettlementProtocol();

    settlement.docketCase({
      caseId,
      title: 'Fusion Q-Factor',
      claimText,
      creatorDid,
      deposit: 300
    });

    market.createMarket({
      claimId: caseId,
      claimText,
      creatorDid,
      initialBounty: 300
    });
  });

  describe('Validation Market Odds & Payout Math', () => {
    it('calculates dynamic odds as TotalPool / OutcomePool', () => {
      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xWhale',
        outcome: OUTCOMES.VERIFIED,
        amount: 300
      });

      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xSkeptic',
        outcome: OUTCOMES.MISINFORMED,
        amount: 100
      });

      // Total pool = 300 (initial) + 300 + 100 = 700
      // Verified pool = 300 -> odds = 700 / 300 = 2.33x
      // Misinformed pool = 100 -> odds = 700 / 100 = 7.00x
      const odds = market.calculateOdds(`market_${caseId}`);
      expect(odds[OUTCOMES.VERIFIED]).toBe(2.33);
      expect(odds[OUTCOMES.MISINFORMED]).toBe(7);
    });

    it('distributes winnings proportionally minus 5% protocol fee', () => {
      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xAlice',
        outcome: OUTCOMES.VERIFIED,
        amount: 200
      });

      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xBob',
        outcome: OUTCOMES.MISINFORMED,
        amount: 200
      });

      // Total pool: 300 + 200 + 200 = 700. Distributable: 700 * 0.95 = 665.
      const settlementReport = market.settleMarket(`market_${caseId}`, OUTCOMES.VERIFIED, 0.05);
      expect(settlementReport.status).toBe('SETTLED');
      expect(settlementReport.protocolCut).toBe(35);
      expect(settlementReport.distributablePool).toBe(665);

      const alicePayout = settlementReport.payouts.find(p => p.stakerDid === 'did:pkh:0xAlice');
      expect(alicePayout.payout).toBe(665);
      expect(alicePayout.profit).toBe(465);
    });
  });

  describe('Courtroom Settlement: 14-Day Cold Case & Challenge Bonds', () => {
    it('enforces 14-day inactivity rule with 94% refund and 6% fee', () => {
      const c = settlement.cases.get(caseId);
      // Simulate 15 days of inactivity
      c.lastActivity = Date.now() - (15 * 24 * 60 * 60 * 1000);

      const staleReport = settlement.checkStaleStatus(caseId);
      expect(staleReport.status).toBe(SETTLEMENT_STATUS.COLD);
      expect(staleReport.refundAmount).toBe(282); // 300 * 0.94
      expect(staleReport.platformFee).toBe(18); // 300 * 0.06
    });

    it('rejects challenge bond under 2x deposit and accepts valid challenge', () => {
      expect(() => {
        settlement.fileChallengeBond(caseId, 'did:pkh:0xChallenger', 500, 'evidence'); // 500 < 600
      }).toThrow(/at least 2x/);

      const res = settlement.fileChallengeBond(caseId, 'did:pkh:0xChallenger', 600, 'https://doi.org/10.1038/s41586');
      expect(res.status).toBe(SETTLEMENT_STATUS.APPEALED);
      expect(res.bondEscrowRatio).toBe(2);
    });
  });

  describe('End-to-End Cryptographic Oracle Bridge', () => {
    it('executes atomic market settlement via signed Courtroom verdict attestation', () => {
      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xCorrectTrader',
        outcome: OUTCOMES.MISINFORMED,
        amount: 200
      });

      // Generate signed attestation from clearCloud Courtroom
      const attestation = verdictAttestationService.createVerdictAttestation({
        caseId,
        claimText,
        verdict: OUTCOMES.MISINFORMED,
        confidence: 0.91,
        jurySize: 15
      });

      // Oracle bridges attestation to settle market
      const bridgeResult = verdictAttestationService.settleMarketWithAttestation(attestation, market);
      expect(bridgeResult.success).toBe(true);
      expect(bridgeResult.settlementReceipt.verdict).toBe(OUTCOMES.MISINFORMED);
      expect(bridgeResult.settlementReceipt.payouts[0].stakerDid).toBe('did:pkh:0xCorrectTrader');
    });
  });
});
