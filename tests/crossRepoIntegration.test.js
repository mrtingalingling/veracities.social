import { describe, it, expect } from 'vitest';

// Layer 0: Vera Core Engine
import { analyzeClaimLocally } from '../../vera/frontend/src/index.js';

// Layer 1.1: clearCloud Identity & Validation Market
import { createAuthProvider, ValidationMarket } from '../../clearCloud/src/index.js';

// Layer 1.2 & 1.3: veracities.social
import { piiScrubber } from '../src/messaging/piiScrubberService.js';
import { caseManager } from '../src/courtroom/caseManager.js';
import { overlayService } from '../src/social/overlayService.js';

describe('Cross-Repository End-to-End Integration (Vera -> clearCloud -> veracities.social)', () => {
  it('executes full pipeline: PII scrubbing -> Vera AI analysis -> ATProto Auth -> Docket Case -> Validation Staking -> Social Overlay', async () => {
    // 1. Layer 1.2: Raw Private Message arrives with PII
    const rawIncomingMessage = 'Hey Dave, my friend Dr. Alan at Stanford says atmospheric CO2 reached 420 ppm in 2024. Call him at +1-555-901-2345';
    const preview = piiScrubber.createVerificationPreview(rawIncomingMessage);

    expect(preview.sanitizedText).toContain('[REDACTED_PHONE]');
    expect(preview.coreClaim).toBe('Atmospheric CO2 reached 420 ppm in 2024');

    // 2. User explicitly confirms verification preview
    preview.isApproved = true;

    // 3. Layer 0: Vera Core evaluates the sanitized claim
    const veraAnalysis = await piiScrubber.confirmAndVerify(preview, async (claim) => {
      return await analyzeClaimLocally(claim);
    });

    expect(veraAnalysis).toBeDefined();
    expect(veraAnalysis.claims[0].verdict).toBe('verified');
    expect(veraAnalysis.metrics.factsPct).toBeGreaterThan(50);

    // 4. Layer 1.1: Authenticate with ATProto via clearCloud
    const auth = createAuthProvider('atproto', { isTestEnv: true });
    const session = await auth.authenticate({ identifier: 'alice.bsky.social', mock: true });
    expect(session.did).toMatch(/^did:plc:/);

    // 5. Layer 1.3: Docket the claim as a formal Courtroom case
    const docketedCase = caseManager.openCase({
      title: 'Global Atmospheric CO2 Measurement Verification',
      claimText: preview.coreClaim,
      creatorDid: session.did,
      initialDeposit: 150
    });
    expect(docketedCase.status).toBe('OPEN');
    expect(docketedCase.creatorDid).toBe(session.did);

    // 6. Layer 1.1 / Layer 2: Open Validation Market staking pool
    const market = new ValidationMarket();
    const claimMarket = market.createMarket({
      claimId: docketedCase.caseId,
      claimText: docketedCase.claimText,
      creatorDid: session.did,
      initialBounty: 150
    });

    const stakeReceipt = market.placeStake({
      marketId: claimMarket.marketId,
      stakerDid: session.did,
      outcome: 'VERIFIED',
      amount: 100
    });
    expect(stakeReceipt.outcome).toBe('VERIFIED');

    // 7. Layer 1: Generate Social Overlay Card for Bluesky feed
    const overlay = overlayService.createOverlayCard({
      platform: 'bluesky',
      postId: 'at://did:plc:alice/app.bsky.feed.post/999123',
      postText: preview.coreClaim,
      analysis: veraAnalysis
    });

    expect(overlay.platform).toBe('bluesky');
    expect(overlay.verdict).toBe('verified');
    expect(overlay.badgeColor).toBe('#10b981');
    expect(overlay.renderedHtml).toContain('vera-badge-verified');
  });
});
