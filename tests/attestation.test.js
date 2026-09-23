import { describe, it, expect, beforeEach } from 'vitest';
import { verdictAttestationService } from '../src/attestation/verdictAttestation.js';
import { ValidationMarket, OUTCOMES } from '../src/market/validationMarket.js';

describe('VerdictAttestationService (Oracle Cryptographic Bridge)', () => {
  let market;
  const testCaseId = 'case_climate_co2_2024';
  const testClaim = 'Atmospheric CO2 reached 420 ppm in 2024';
  const secretKey = 'super_secret_oracle_key';

  beforeEach(() => {
    market = new ValidationMarket();
    market.createMarket({
      claimId: testCaseId,
      claimText: testClaim,
      creatorDid: 'did:plc:creator123',
      initialBounty: 100
    });

    // Stake 200 on VERIFIED and 100 on MISINFORMED
    market.placeStake({
      marketId: `market_${testCaseId}`,
      stakerDid: 'did:pkh:0xAliceWinner',
      outcome: OUTCOMES.VERIFIED,
      amount: 200
    });

    market.placeStake({
      marketId: `market_${testCaseId}`,
      stakerDid: 'did:pkh:0xBobLoser',
      outcome: OUTCOMES.MISINFORMED,
      amount: 100
    });
  });

  it('creates and verifies a valid cryptographic verdict attestation', () => {
    const attestation = verdictAttestationService.createVerdictAttestation({
      caseId: testCaseId,
      claimText: testClaim,
      verdict: OUTCOMES.VERIFIED,
      confidence: 0.88,
      jurySize: 12,
      judgeDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      secretKey
    });

    expect(attestation.attestationId).toBeDefined();
    expect(attestation.signature).toBeDefined();
    expect(attestation.message.verdict).toBe(OUTCOMES.VERIFIED);

    const verification = verdictAttestationService.verifyVerdictAttestation(attestation, secretKey);
    expect(verification.valid).toBe(true);
    expect(verification.verdict).toBe(OUTCOMES.VERIFIED);
  });

  it('rejects an attestation with tampered payload or invalid signature', () => {
    const attestation = verdictAttestationService.createVerdictAttestation({
      caseId: testCaseId,
      claimText: testClaim,
      verdict: OUTCOMES.VERIFIED,
      confidence: 0.95,
      secretKey
    });

    // Tamper with the verdict
    attestation.message.verdict = OUTCOMES.MISINFORMED;

    const verification = verdictAttestationService.verifyVerdictAttestation(attestation, secretKey);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('tamper detected');
  });

  it('prevents replay attacks using single-use nonces', () => {
    const attestation = verdictAttestationService.createVerdictAttestation({
      caseId: testCaseId,
      claimText: testClaim,
      verdict: OUTCOMES.VERIFIED,
      secretKey
    });

    // First verification succeeds
    const firstCheck = verdictAttestationService.verifyVerdictAttestation(attestation, secretKey);
    expect(firstCheck.valid).toBe(true);

    // Second verification fails due to consumed nonce
    const replayCheck = verdictAttestationService.verifyVerdictAttestation(attestation, secretKey);
    expect(replayCheck.valid).toBe(false);
    expect(replayCheck.reason).toContain('Replay attack detected');
  });

  it('atomically bridges verified attestation into ValidationMarket settlement', () => {
    const attestation = verdictAttestationService.createVerdictAttestation({
      caseId: testCaseId,
      claimText: testClaim,
      verdict: OUTCOMES.VERIFIED,
      confidence: 0.92,
      secretKey
    });

    const bridgeResult = verdictAttestationService.settleMarketWithAttestation(
      attestation,
      market,
      secretKey
    );

    expect(bridgeResult.success).toBe(true);
    expect(bridgeResult.settlementReceipt.status).toBe('SETTLED');
    expect(bridgeResult.settlementReceipt.verdict).toBe(OUTCOMES.VERIFIED);

    // Payout should go to Alice
    const alicePayout = bridgeResult.settlementReceipt.payouts.find(p => p.stakerDid === 'did:pkh:0xAliceWinner');
    expect(alicePayout).toBeDefined();
    expect(alicePayout.payout).toBeGreaterThan(200);
  });
});
