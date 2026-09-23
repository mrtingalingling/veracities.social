import { describe, it, expect } from 'vitest';

// Layer 0: Vera Core Engine (Local AI + PII Scrubber)
import { analyzeClaimLocally, piiScrubber } from '../../vera/frontend/src/index.js';

// Protocol & Settlement Backend: veracities.social
import { createAuthProvider } from '../src/identity/index.js';
import { ValidationMarket, OUTCOMES } from '../src/market/validationMarket.js';
import { courtroomSettlement } from '../src/settlement/courtroomSettlement.js';

describe('Protocol & Settlement Integration with @vera/core', () => {
  it('integrates Vera Layer 0 AI analysis with veracities.social protocol staking and settlement', async () => {
    // 1. Scrub incoming claim using Vera's PII Scrubber
    const raw = 'Hey Dave, NASA confirmed atmospheric CO2 reached 420 ppm in 2024. Call bob@lab.org';
    const preview = piiScrubber.createVerificationPreview(raw);
    expect(preview.sanitizedText).toContain('[REDACTED_EMAIL]');
    expect(preview.coreClaim).toBe('Atmospheric CO2 reached 420 ppm in 2024');

    // 2. Perform local AI claim verification
    preview.isApproved = true;
    const analysis = await piiScrubber.confirmAndVerify(preview, analyzeClaimLocally);
    expect(analysis.claims[0].verdict).toBe('verified');

    // 3. Authenticate user via ATProto identity broker
    const auth = createAuthProvider('atproto', { isTestEnv: true });
    const session = await auth.authenticate({ identifier: 'alice.bsky.social', mock: true });
    expect(session.did).toBe('did:plc:alicebskysocial');

    // 4. Open Validation Market pool under protocol
    const market = new ValidationMarket();
    const claimMarket = market.createMarket({
      claimId: 'claim_atm_420',
      claimText: preview.coreClaim,
      creatorDid: session.did,
      initialBounty: 200
    });

    // 5. Staker stakes on VERIFIED
    market.placeStake({
      marketId: claimMarket.marketId,
      stakerDid: session.did,
      outcome: OUTCOMES.VERIFIED,
      amount: 100
    });

    // 6. Settle market under protocol rules
    const settlement = market.settleMarket(claimMarket.marketId, OUTCOMES.VERIFIED, 0.05);
    expect(settlement.status).toBe('SETTLED');
    expect(settlement.payouts[0].stakerDid).toBe('did:plc:alicebskysocial');
  });
});
