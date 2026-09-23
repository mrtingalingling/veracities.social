import { describe, it, expect } from 'vitest';
import { piiScrubber } from '../src/messaging/piiScrubberService.js';

describe('Layer 1.2: Private Messaging Add-on & Local PII Scrubber', () => {
  it('scrubs emails, phone numbers, and handles from private messages', () => {
    const raw = 'Hey Dave, email me at doctor.smith@clinic.org or call +1-555-837-1234. Ping @dr_smith on twitter.';
    const result = piiScrubber.scrubPii(raw);

    expect(result.sanitizedText).toContain('[REDACTED_EMAIL]');
    expect(result.sanitizedText).toContain('[REDACTED_PHONE]');
    expect(result.sanitizedText).toContain('[REDACTED_HANDLE]');
    expect(result.sanitizedText).not.toContain('doctor.smith@clinic.org');
    expect(result.sanitizedText).not.toContain('+1-555-837-1234');
    expect(result.redactedEntities.length).toBe(3);
  });

  it('extracts core factual claim from conversational gossip preambles', () => {
    const raw = 'Hey Dave, my doctor friend at Mayo Clinic says drinking warm water with salt cures COVID';
    const core = piiScrubber.extractCoreClaim(raw);
    expect(core).toBe('Drinking warm water with salt cures COVID');
  });

  it('generates zero-leakage preview requiring explicit user opt-in', () => {
    const raw = 'Listen bro, someone forwarded this to me: Atmospheric CO2 reached 420 ppm in 2024. Contact bob@lab.org';
    const preview = piiScrubber.createVerificationPreview(raw);

    expect(preview.sanitizedText).toContain('[REDACTED_EMAIL]');
    expect(preview.coreClaim).toContain('Atmospheric CO2 reached 420 ppm in 2024');
    expect(preview.isApproved).toBe(false);
    expect(preview.zeroDataLeakageNotice).toBeDefined();
  });

  it('blocks verification until user explicitly approves preview', async () => {
    const raw = 'Good morning team, NASA confirmed water on Europa';
    const preview = piiScrubber.createVerificationPreview(raw);

    let verifierCalled = false;
    const dummyVerifier = async (claim) => {
      verifierCalled = true;
      return { verdict: 'verified', claim };
    };

    // Should throw if not approved
    await expect(piiScrubber.confirmAndVerify(preview, dummyVerifier)).rejects.toThrow('Explicit user confirmation required');
    expect(verifierCalled).toBe(false);

    // Should succeed once user marks isApproved = true
    preview.isApproved = true;
    const res = await piiScrubber.confirmAndVerify(preview, dummyVerifier);
    expect(verifierCalled).toBe(true);
    expect(res.verdict).toBe('verified');
  });
});
