import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RedisPubSubService, CHANNELS } from '../src/events/redisPubSubService.js';

describe('Real-Time Redis Pub/Sub & Caching Engine (Option A)', () => {
  let pubsub;

  beforeEach(() => {
    pubsub = new RedisPubSubService({ inMemoryOnly: true });
  });

  afterEach(async () => {
    await pubsub.disconnect();
  });

  it('publishes and receives live Courtroom docket events', async () => {
    const receivedEvents = [];

    const unsubscribe = await pubsub.subscribe(CHANNELS.DOCKET_NEW, (event) => {
      receivedEvents.push(event);
    });

    await pubsub.publish(CHANNELS.DOCKET_NEW, {
      caseId: 'case_live_test_1',
      title: 'Breaking news verification',
      claimText: 'New discovery announced',
      timestamp: Date.now()
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].caseId).toBe('case_live_test_1');

    unsubscribe();

    // Verify unsubscribed handler receives no further events
    await pubsub.publish(CHANNELS.DOCKET_NEW, { caseId: 'case_live_test_2' });
    expect(receivedEvents.length).toBe(1);
  });

  it('broadcasts real-time juror vote notifications and consensus events', async () => {
    const voteEvents = [];
    const consensusEvents = [];

    await pubsub.subscribe(CHANNELS.JUROR_VOTE, (evt) => voteEvents.push(evt));
    await pubsub.subscribe(CHANNELS.VERDICT_CONSENSUS, (evt) => consensusEvents.push(evt));

    await pubsub.publish(CHANNELS.JUROR_VOTE, {
      caseId: 'case_election_claim',
      jurorDid: 'did:plc:juror1',
      vote: 'DENY',
      evidenceUrl: 'https://archive.org/audit_report.pdf'
    });

    await pubsub.publish(CHANNELS.VERDICT_CONSENSUS, {
      caseId: 'case_election_claim',
      verdict: 'MISINFORMED',
      supermajorityPct: 75.0,
      decisiveEvidenceContributorDid: 'did:plc:juror1'
    });

    expect(voteEvents.length).toBe(1);
    expect(voteEvents[0].vote).toBe('DENY');

    expect(consensusEvents.length).toBe(1);
    expect(consensusEvents[0].verdict).toBe('MISINFORMED');
    expect(consensusEvents[0].supermajorityPct).toBe(75.0);
  });

  it('caches active market data with TTL expiration support', async () => {
    const cacheKey = 'market:pool:market_test_42';
    const poolData = {
      totalPool: '2500000000000000000', // 2.5 ETH
      outcomes: { verified: '1.5', misinformed: '1.0' }
    };

    // Set cache without TTL
    await pubsub.setCache(cacheKey, poolData);
    const cached = await pubsub.getCache(cacheKey);
    expect(cached).toEqual(poolData);

    // Test deletion
    await pubsub.deleteCache(cacheKey);
    const afterDelete = await pubsub.getCache(cacheKey);
    expect(afterDelete).toBeNull();
  });

  it('enforces TTL expiration on temporary SIWE nonces', async () => {
    const nonceKey = 'siwe:nonce:0x1111111111111111111111111111111111111111';
    await pubsub.setCache(nonceKey, { nonce: 'nonce_temp_123', createdAt: Date.now() }, 0.05); // 50ms TTL

    const immediate = await pubsub.getCache(nonceKey);
    expect(immediate.nonce).toBe('nonce_temp_123');

    // Wait for TTL expiration
    await new Promise(resolve => setTimeout(resolve, 60));

    const expired = await pubsub.getCache(nonceKey);
    expect(expired).toBeNull();
  });
});
