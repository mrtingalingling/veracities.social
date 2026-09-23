import { sha256, hmacSha256 } from './cryptoUtils.js';
import { OUTCOMES } from '../market/validationMarket.js';

export const ATTESTATION_DOMAIN = {
  name: 'veracities.social',
  purpose: 'Courtroom-Verdict-Oracle',
  version: '1.0.0',
  standard: 'EIP-712-COMPATIBLE'
};

export class VerdictAttestationService {
  constructor() {
    this.usedNonces = new Set();
    this.verifiedAttestations = new Map();
  }

  /**
   * Generates a signed cryptographic attestation for a Courtroom verdict.
   */
  createVerdictAttestation({
    caseId,
    claimText,
    verdict,
    confidence = 1.0,
    jurySize = 1,
    judgeDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    decisiveEvidenceContributorDid = null,
    participatingJurorDids = [],
    secretKey = 'veracities_oracle_secret'
  }) {
    if (!caseId || !claimText || !verdict) {
      throw new Error('caseId, claimText, and verdict are required for attestation');
    }

    if (!OUTCOMES[verdict]) {
      throw new Error(`Invalid verdict outcome: ${verdict}`);
    }

    const nonce = `nonce_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const timestamp = Date.now();

    const message = {
      caseId,
      claimText,
      verdict,
      confidence: Math.round(confidence * 1000) / 1000,
      jurySize,
      judgeDid,
      decisiveEvidenceContributorDid,
      participatingJurorDids,
      timestamp,
      nonce
    };

    // Calculate deterministic canonical hash of the message payload
    const canonicalString = JSON.stringify(message, Object.keys(message).sort());
    const messageHash = sha256(canonicalString);

    // Generate cryptographic HMAC-SHA256 signature
    const signature = hmacSha256(secretKey, messageHash);

    const attestation = {
      attestationId: `attest_${caseId}_${timestamp}`,
      domain: ATTESTATION_DOMAIN,
      message,
      messageHash,
      signature
    };

    return attestation;
  }

  /**
   * Verifies an incoming verdict attestation before market resolution.
   */
  verifyVerdictAttestation(attestation, secretKey = 'veracities_oracle_secret', maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    if (!attestation || !attestation.message || !attestation.signature) {
      return { valid: false, reason: 'Malformed attestation payload.' };
    }

    const { message, messageHash, signature } = attestation;

    // 1. Check replay attack via nonce
    if (this.usedNonces.has(message.nonce)) {
      return { valid: false, reason: 'Replay attack detected: Nonce has already been consumed.' };
    }

    // 2. Check expiration
    const now = Date.now();
    if (now - message.timestamp > maxAgeMs) {
      return { valid: false, reason: 'Attestation has expired beyond allowable oracle max age.' };
    }

    // 3. Verify canonical message hash
    const canonicalString = JSON.stringify(message, Object.keys(message).sort());
    const expectedHash = sha256(canonicalString);

    if (messageHash !== expectedHash) {
      return { valid: false, reason: 'Attestation messageHash tamper detected: Hash mismatch.' };
    }

    // 4. Verify cryptographic signature
    const expectedSignature = hmacSha256(secretKey, expectedHash);
    if (signature !== expectedSignature) {
      return { valid: false, reason: 'Cryptographic signature verification failed: Invalid oracle key.' };
    }

    // Mark nonce as consumed
    this.usedNonces.add(message.nonce);
    this.verifiedAttestations.set(attestation.attestationId, attestation);

    return {
      valid: true,
      attestationId: attestation.attestationId,
      caseId: message.caseId,
      verdict: message.verdict,
      confidence: message.confidence,
      verifiedAt: now
    };
  }

  /**
   * Bridges a verified attestation directly into a ValidationMarket instance to settle pools atomically.
   */
  settleMarketWithAttestation(attestation, validationMarket, secretKey = 'veracities_oracle_secret') {
    const verification = this.verifyVerdictAttestation(attestation, secretKey);
    if (!verification.valid) {
      throw new Error(`Oracle Attestation Rejected: ${verification.reason}`);
    }

    const marketId = `market_${verification.caseId}`;
    let targetMarketId = marketId;
    if (!validationMarket.markets.has(targetMarketId)) {
      if (validationMarket.markets.has(verification.caseId)) {
        targetMarketId = verification.caseId;
      } else {
        throw new Error(`Target market not found for case: ${verification.caseId}`);
      }
    }

    const settlementOptions = {
      decisiveEvidenceContributorDid: attestation.message?.decisiveEvidenceContributorDid || null,
      participatingJurorDids: attestation.message?.participatingJurorDids || [],
      evidenceBountyPct: 0.15,
      jurorFeePct: 0.05
    };

    const settlementReceipt = validationMarket.settleMarket(targetMarketId, verification.verdict, settlementOptions);
    return {
      success: true,
      attestationId: verification.attestationId,
      verification,
      settlementReceipt
    };
  }
}

export const verdictAttestationService = new VerdictAttestationService();
