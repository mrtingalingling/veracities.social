import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationMarket, OUTCOMES } from '../src/market/validationMarket.js';
import { identityLinkService } from '../src/identity/identityLinkService.js';
import { verdictAttestationService } from '../src/attestation/verdictAttestation.js';

describe('Truth-Seeker Evidence Bounty & Conflict-of-Interest Recusal', () => {
  let market;
  const caseId = 'case_golf_or_doctor';
  const claimText = 'John was golfing on Monday';

  beforeEach(() => {
    market = new ValidationMarket();
    market.createMarket({
      claimId: caseId,
      claimText,
      creatorDid: 'did:plc:originator',
      initialBounty: 200
    });
  });

  describe('Losing Pool Slashing & Whistleblower Bounty Distribution', () => {
    it('slashes losing pool to pay 15% Whistleblower bounty and 5% Juror fees', () => {
      // Alice bets $400 on MISINFORMED (the truth)
      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xAliceWinner',
        outcome: OUTCOMES.MISINFORMED,
        amount: 400
      });

      // Speculator Bob bets $600 on VERIFIED (the false rumor)
      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xBobSpeculator',
        outcome: OUTCOMES.VERIFIED,
        amount: 600
      });

      // Total pool = 200 (initial) + 400 + 600 = 1200.
      // Winning pool (MISINFORMED) = 400.
      // Losing pool = 1200 - 400 = 800.
      const whistleblowerDid = 'did:plc:dr_receipt_provider';
      const jurors = ['did:plc:juror_1', 'did:plc:juror_2'];

      const receipt = market.settleMarket(`market_${caseId}`, OUTCOMES.MISINFORMED, {
        protocolFeePct: 0.05, // 5% of total = 60
        evidenceBountyPct: 0.15, // 15% of losing pool = 120
        jurorFeePct: 0.05, // 5% of losing pool = 40 (20 each)
        decisiveEvidenceContributorDid: whistleblowerDid,
        participatingJurorDids: jurors
      });

      expect(receipt.status).toBe('SETTLED');
      expect(receipt.losingPool).toBe(800);
      expect(receipt.evidenceBounty).toBe(120);
      expect(receipt.jurorFeePool).toBe(40);
      expect(receipt.protocolCut).toBe(60);

      // Verify whistleblower receipt line item
      const whistleblowerPayout = receipt.payouts.find(p => p.recipientDid === whistleblowerDid);
      expect(whistleblowerPayout).toBeDefined();
      expect(whistleblowerPayout.type).toBe('EVIDENCE_BOUNTY');
      expect(whistleblowerPayout.payout).toBe(120);

      // Verify juror receipt line items
      const juror1Payout = receipt.payouts.find(p => p.recipientDid === 'did:plc:juror_1');
      expect(juror1Payout.type).toBe('JUROR_DELIBERATION_FEE');
      expect(juror1Payout.payout).toBe(20);

      // Verify winning staker Alice receives return + remaining surplus
      const alicePayout = receipt.payouts.find(p => p.recipientDid === 'did:pkh:0xAliceWinner');
      expect(alicePayout.type).toBe('WINNING_STAKE');
      expect(alicePayout.payout).toBe(980); // 1200 - 60 - 120 - 40 = 980
      expect(alicePayout.profit).toBe(580);
    });

    it('handles settlement cleanly when no losing pool exists', () => {
      const zeroMarket = new ValidationMarket();
      zeroMarket.createMarket({
        claimId: 'zero_case',
        claimText: 'Zero losing pool test',
        creatorDid: 'did:plc:creator',
        initialBounty: 0
      });
      zeroMarket.placeStake({
        marketId: 'market_zero_case',
        stakerDid: 'did:pkh:0xAliceOnly',
        outcome: OUTCOMES.VERIFIED,
        amount: 300
      });

      // Total pool = 300, all on VERIFIED. Losing pool = 0.
      const receipt = zeroMarket.settleMarket('market_zero_case', OUTCOMES.VERIFIED, {
        decisiveEvidenceContributorDid: 'did:plc:nobody',
        evidenceBountyPct: 0.15
      });

      expect(receipt.losingPool).toBe(0);
      expect(receipt.evidenceBounty).toBe(0);
      expect(receipt.payouts.length).toBe(1);
    });
  });

  describe('Identity Linkage & Conflict-of-Interest Recusal Firewall', () => {
    it('links ATProto DID to Web3 address bidirectionally', () => {
      identityLinkService.linkIdentities('did:plc:investor_jane', '0xJaneWalletAddress123');

      expect(identityLinkService.resolveWeb3('did:plc:investor_jane')).toBe('0xjanewalletaddress123');
      expect(identityLinkService.resolveAtproto('0xjanewalletaddress123')).toBe('did:plc:investor_jane');
    });

    it('detects conflict of interest when an ATProto user has an active Web3 stake on that market', () => {
      const atprotoDid = 'did:plc:trader_charlie';
      const web3Addr = '0xcharlieevm987';

      identityLinkService.linkIdentities(atprotoDid, web3Addr);

      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: web3Addr,
        outcome: OUTCOMES.MISINFORMED,
        amount: 250
      });

      const conflictCheck = identityLinkService.checkConflictOfInterest(atprotoDid, `market_${caseId}`, market);
      expect(conflictCheck.hasConflict).toBe(true);
      expect(conflictCheck.stakedAmount).toBe(250);
      expect(conflictCheck.recusalReason).toContain('active $250 financial wager');
    });

    it('passes conflict check if identity has no stake in the market', () => {
      const cleanCheck = identityLinkService.checkConflictOfInterest('did:plc:disinterested_citizen', `market_${caseId}`, market);
      expect(cleanCheck.hasConflict).toBe(false);
    });
  });

  describe('End-to-End Cryptographic Oracle Bridge with Evidence Bounty', () => {
    it('settles market with whistleblower evidence bounty from signed attestation', () => {
      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xSkepticTrader',
        outcome: OUTCOMES.MISINFORMED,
        amount: 500
      });

      market.placeStake({
        marketId: `market_${caseId}`,
        stakerDid: 'did:pkh:0xRumorBeliever',
        outcome: OUTCOMES.VERIFIED,
        amount: 500
      });

      const attestation = verdictAttestationService.createVerdictAttestation({
        caseId,
        claimText,
        verdict: OUTCOMES.MISINFORMED,
        confidence: 0.96,
        jurySize: 9,
        decisiveEvidenceContributorDid: 'did:plc:investigative_journalist',
        participatingJurorDids: ['did:plc:juror_a', 'did:plc:juror_b']
      });

      const bridgeResult = verdictAttestationService.settleMarketWithAttestation(attestation, market);
      expect(bridgeResult.success).toBe(true);

      const receipt = bridgeResult.settlementReceipt;
      expect(receipt.evidenceBounty).toBeGreaterThan(0);
      const journalistPayout = receipt.payouts.find(p => p.recipientDid === 'did:plc:investigative_journalist');
      expect(journalistPayout).toBeDefined();
      expect(journalistPayout.type).toBe('EVIDENCE_BOUNTY');
    });
  });
});
