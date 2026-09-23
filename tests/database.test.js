import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/db/databaseService.js';

describe('Relational Database Persistence Layer (Option A)', () => {
  let db;

  beforeEach(() => {
    db = new DatabaseService({ inMemoryOnly: true });
  });

  it('manages user identity links and wallet lookup', async () => {
    const user = await db.upsertUser({
      did: 'did:plc:alice123',
      handle: 'alice.bsky.social',
      walletAddress: '0x1111111111111111111111111111111111111111',
      siweNonce: 'nonce_abc_123'
    });

    expect(user.did).toBe('did:plc:alice123');
    expect(user.walletAddress).toBe('0x1111111111111111111111111111111111111111');

    const foundByDid = await db.findUserByDid('did:plc:alice123');
    expect(foundByDid.handle).toBe('alice.bsky.social');

    const foundByWallet = await db.findUserByWallet('0x1111111111111111111111111111111111111111');
    expect(foundByWallet.did).toBe('did:plc:alice123');
  });

  it('stores posts, claims, and links to docket cases', async () => {
    await db.upsertUser({ did: 'did:plc:reporter_bob', handle: 'bob.bsky.social' });

    const post = await db.createPost({
      uri: 'at://did:plc:reporter_bob/app.bsky.feed.post/post123',
      cid: 'bafyreiexbobcid123',
      authorDid: 'did:plc:reporter_bob',
      text: 'Breaking: John was golfing on Monday morning at Augusta.',
      claimText: 'John went golfing on Monday morning',
      groundednessScore: 0.35
    });

    expect(post.authorDid).toBe('did:plc:reporter_bob');
    expect(post.groundednessScore).toBe(0.35);

    const retrieved = await db.getPostByUri('at://did:plc:reporter_bob/app.bsky.feed.post/post123');
    expect(retrieved.id).toBe(post.id);
  });

  it('tracks full Courtroom docket lifecycle with juror deliberation and consensus', async () => {
    await db.upsertUser({ did: 'did:plc:judge_carol' });
    await db.upsertUser({ did: 'did:plc:juror_dan' });
    await db.upsertUser({ did: 'did:plc:juror_eve' });
    await db.upsertUser({ did: 'did:plc:whistleblower_frank', walletAddress: '0xFAAAAAAAAAAAAA' });

    const docket = await db.createDocketCase({
      id: 'case_golf_vs_doctor_alibi',
      title: 'Alleged Golf Trip vs Clinic Alibi',
      claimText: 'Subject went golfing on Monday morning',
      blindedProposition: 'Individual [REDACTED] was at location [REDACTED] on date [REDACTED]',
      creatorDid: 'did:plc:judge_carol'
    });

    expect(docket.status).toBe('ACTIVE');

    // Juror votes
    await db.castJurorVote({
      caseId: docket.id,
      jurorDid: 'did:plc:juror_dan',
      vote: 'DENY',
      weight: 1.0,
      evidenceUrl: 'https://records.hospital.org/alibi/appointment_signed.pdf'
    });

    await db.castJurorVote({
      caseId: docket.id,
      jurorDid: 'did:plc:juror_eve',
      vote: 'DENY',
      weight: 1.0,
      evidenceUrl: 'https://traffic.city.gov/cameras/toll_passage_timestamp.jpg'
    });

    const votes = await db.getVotesForCase(docket.id);
    expect(votes.length).toBe(2);

    // Conclude case
    const concluded = await db.concludeDocketCase(docket.id, {
      finalVerdict: 'MISINFORMED',
      confidence: 0.95,
      reasoning: 'Primary medical alibi establishes subject was at cardiology clinic.',
      decisiveEvidenceContributorDid: 'did:plc:whistleblower_frank',
      decisiveEvidenceUrl: 'https://records.hospital.org/alibi/appointment_signed.pdf',
      onChainTxHash: '0x9999999999999999999999999999999999999999999999999999999999999999'
    });

    expect(concluded.status).toBe('CONCLUDED');
    expect(concluded.finalVerdict).toBe('MISINFORMED');
    expect(concluded.decisiveEvidenceContributorDid).toBe('did:plc:whistleblower_frank');
  });

  it('persists validation markets, stakes, and pool balances', async () => {
    const market = await db.createValidationMarket({
      id: 'market_case_golf_alibi',
      caseId: 'case_golf_vs_doctor_alibi',
      claimText: 'Subject went golfing on Monday morning',
      creatorAddress: '0x1111111111111111111111111111111111111111'
    });

    expect(market.totalPool).toBe('0');

    // Place stakes
    const stake1 = await db.recordMarketStake({
      marketId: market.id,
      stakerAddress: '0x2222222222222222222222222222222222222222',
      outcome: 0, // VERIFIED
      amount: '500000000000000000' // 0.5 ETH
    });

    const stake2 = await db.recordMarketStake({
      marketId: market.id,
      stakerAddress: '0x3333333333333333333333333333333333333333',
      outcome: 1, // MISINFORMED
      amount: '500000000000000000' // 0.5 ETH
    });

    expect(stake1.amount).toBe('500000000000000000');
    expect(stake2.amount).toBe('500000000000000000');

    const updatedMarket = await db.getValidationMarket(market.id);
    expect(updatedMarket.totalPool).toBe('1000000000000000000'); // 1.0 ETH
    expect(updatedMarket.stakes.length).toBe(2);

    // Settle market
    const settled = await db.settleValidationMarket(market.id, {
      finalVerdict: 1,
      decisiveWhistleblower: '0xFAAAAAAAAAAAAA',
      onChainTxHash: '0xABCDEF1234567890'
    });

    expect(settled.status).toBe('SETTLED');
    expect(settled.finalVerdict).toBe(1);
    expect(settled.decisiveWhistleblower).toBe('0xFAAAAAAAAAAAAA');
  });

  it('records cryptographic oracle attestations with unique nonces', async () => {
    const attestation = await db.saveAttestationRecord({
      id: 'attest_123',
      caseId: 'case_golf_vs_doctor_alibi',
      marketId: 'market_case_golf_alibi',
      verdict: 'MISINFORMED',
      confidence: 0.95,
      oracleSignature: '0x1234567890abcdef...',
      messageHash: '0xabcdef123456...',
      nonce: 'nonce_987654321',
      onChainTxHash: '0x1111111111'
    });

    expect(attestation.nonce).toBe('nonce_987654321');

    const found = await db.getAttestationByNonce('nonce_987654321');
    expect(found.id).toBe('attest_123');
    expect(found.verdict).toBe('MISINFORMED');
  });
});
