import { describe, it, expect } from 'vitest';
import { feedVerifier } from '../src/social/feedVerifier.js';
import { overlayService } from '../src/social/overlayService.js';

describe('Layer 1: Social Feed Verifier & Groundedness Ranking', () => {
  it('calculates Groundedness Index according to PRD formula', () => {
    // G = Facts / (Facts + Speculation + (Falsehood * 3))
    // Example: Facts = 80, Speculation = 10, Falsehood = 10
    // Denominator = 80 + 10 + 30 = 120 -> 80 / 120 = 0.667
    const gIndex = feedVerifier.calculateGroundednessIndex({
      factsPct: 80,
      opinionPct: 10,
      falsehoodPct: 10
    });
    expect(gIndex).toBe(0.667);
  });

  it('demonstrates asymmetric hidden reputation dynamics ("Trust is hard to build, fast to lose")', () => {
    const userDid = 'did:plc:creator_reputation_test';
    const initialRep = feedVerifier.getHiddenReputation(userDid);
    expect(initialRep).toBe(50.0);

    // High-quality verified post adds small increment
    const repAfterVerified = feedVerifier.adjustHiddenReputation(userDid, 'VERIFIED_POST');
    expect(repAfterVerified).toBe(51.5);

    // Debunked post incurs swift severe deduction (-18.0)
    const repAfterDebunked = feedVerifier.adjustHiddenReputation(userDid, 'DEBUNKED_POST');
    expect(repAfterDebunked).toBe(33.5);

    // Courtroom slashing incurs catastrophic deduction (-25.0)
    const repAfterSlashing = feedVerifier.adjustHiddenReputation(userDid, 'COURTROOM_SLASHED');
    expect(repAfterSlashing).toBe(8.5);
  });

  it('filters rage-bait in Tier 1 Close Circle feeds when enabled', () => {
    const rageBaitPost = {
      authorDid: 'did:plc:sensationalist',
      metrics: { factsPct: 10, opinionPct: 70, falsehoodPct: 20 }
    };

    // Disabled filter lets it pass Tier 1
    const passResult = feedVerifier.rankPostVisibility(rageBaitPost, 1, false);
    expect(passResult.visible).toBe(true);

    // Enabled filter scrubs rage-bait from Tier 1 Close Friends
    const scrubbedResult = feedVerifier.rankPostVisibility(rageBaitPost, 1, true);
    expect(scrubbedResult.visible).toBe(false);
    expect(scrubbedResult.reason).toContain('Rage-Bait Scrubber');
  });

  it('throttles network-wide reach for creators with penalized reputation', () => {
    const penalizedDid = 'did:plc:spammer_1';
    feedVerifier.adjustHiddenReputation(penalizedDid, 'COURTROOM_SLASHED');
    feedVerifier.adjustHiddenReputation(penalizedDid, 'COURTROOM_SLASHED'); // Rep drops to 0

    const post = {
      authorDid: penalizedDid,
      metrics: { factsPct: 50, opinionPct: 50, falsehoodPct: 0 }
    };

    const rank = feedVerifier.rankPostVisibility(post, 3);
    expect(rank.visible).toBe(false);
    expect(rank.authorReputationTier).toBe('THROTTLED');
  });
});

describe('Layer 1: Social Platform Overlay Service', () => {
  it('formats verified overlay card for Bluesky', () => {
    const card = overlayService.createOverlayCard({
      platform: 'bluesky',
      postId: 'at://did:plc:alice/app.bsky.feed.post/3kabc123',
      postText: 'NASA confirmed Europa oceanic water plumes',
      analysis: {
        verdict: 'verified',
        confidence: 94,
        metrics: { factsPct: 90, opinionPct: 10, falsehoodPct: 0 },
        claims: [{ verdict: 'verified', sources: ['NASA Jet Propulsion Laboratory'] }]
      }
    });

    expect(card.cardId).toBe('overlay_bluesky_at://did:plc:alice/app.bsky.feed.post/3kabc123');
    expect(card.verdict).toBe('verified');
    expect(card.badgeColor).toBe('#10b981'); // Emerald
    expect(card.badgeLabel).toBe('Verified Claim');
    expect(card.confidence).toBe(94);
    expect(card.renderedHtml).toContain('vera-badge-verified');
  });

  it('formats refuted overlay card for X / Twitter', () => {
    const card = overlayService.createOverlayCard({
      platform: 'x',
      postId: '18928374928374',
      postText: 'Drinking saltwater cures cancer',
      analysis: {
        verdict: 'misinformed',
        confidence: 98,
        metrics: { factsPct: 0, opinionPct: 10, falsehoodPct: 90 },
        claims: [{ verdict: 'misinformed', sources: ['Oncology Medical Consensus'] }]
      }
    });

    expect(card.verdict).toBe('misinformed');
    expect(card.badgeColor).toBe('#f43f5e'); // Rose
    expect(card.badgeLabel).toBe('Refuted / Falsehood');
    expect(card.renderedHtml).toContain('vera-badge-misinformed');
  });
});
