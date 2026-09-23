import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { siweLinkService } from '../src/identity/siweService.js';
import { identityLinkService } from '../src/identity/identityLinkService.js';

describe('EIP-4361 Sign-In with Ethereum & ATProto Linkage', () => {
  it('generates a standard compliant EIP-4361 challenge', () => {
    const wallet = Wallet.createRandom();
    const challenge = siweLinkService.generateChallenge({
      atprotoDid: 'did:plc:alice_in_wonderland',
      web3Address: wallet.address
    });

    expect(challenge.message).toContain('veracities.social wants you to sign in with your Ethereum account:');
    expect(challenge.message).toContain(wallet.address);
    expect(challenge.message).toContain('Authorize linking ATProto DID did:plc:alice_in_wonderland');
    expect(challenge.message).toContain('Nonce: ');
    expect(challenge.message).toContain('Issued At: ');
  });

  it('cryptographically verifies a valid SIWE signature and returns an ATProto record', async () => {
    const wallet = Wallet.createRandom();
    const atprotoDid = 'did:plc:cryptographic_trader';

    const challenge = siweLinkService.generateChallenge({
      atprotoDid,
      web3Address: wallet.address
    });

    // Wallet signs the challenge message
    const signature = await wallet.signMessage(challenge.message);

    const verification = siweLinkService.verifySignature({
      message: challenge.message,
      signature,
      expectedAddress: wallet.address,
      expectedDid: atprotoDid
    });

    expect(verification.success).toBe(true);
    expect(verification.recoveredAddress.toLowerCase()).toBe(wallet.address.toLowerCase());
    expect(verification.atprotoRecord.$type).toBe('social.veracities.identity.link');
    expect(verification.atprotoRecord.signature).toBe(signature);
  });

  it('rejects an invalid signature or signer mismatch', async () => {
    const legitimateWallet = Wallet.createRandom();
    const attackerWallet = Wallet.createRandom();

    const challenge = siweLinkService.generateChallenge({
      atprotoDid: 'did:plc:honest_user',
      web3Address: legitimateWallet.address
    });

    // Attacker signs the message instead of legitimate wallet
    const forgedSignature = await attackerWallet.signMessage(challenge.message);

    const verification = siweLinkService.verifySignature({
      message: challenge.message,
      signature: forgedSignature,
      expectedAddress: legitimateWallet.address
    });

    expect(verification.success).toBe(false);
    expect(verification.reason).toContain('Signer mismatch');
  });

  it('prevents replay attacks using spent nonces', async () => {
    const wallet = Wallet.createRandom();
    const challenge = siweLinkService.generateChallenge({
      atprotoDid: 'did:plc:replay_target',
      web3Address: wallet.address
    });

    const signature = await wallet.signMessage(challenge.message);

    const firstAttempt = siweLinkService.verifySignature({
      message: challenge.message,
      signature
    });
    expect(firstAttempt.success).toBe(true);

    // Second attempt with exact same message/nonce must be rejected
    const secondAttempt = siweLinkService.verifySignature({
      message: challenge.message,
      signature
    });
    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.reason).toContain('Replay detected');
  });

  it('integrates cryptographically into identityLinkService', async () => {
    const wallet = Wallet.createRandom();
    const did = 'did:plc:end_to_end_verified';

    const challenge = siweLinkService.generateChallenge({
      atprotoDid: did,
      web3Address: wallet.address
    });

    const signature = await wallet.signMessage(challenge.message);

    const result = identityLinkService.linkIdentities(did, wallet.address, {
      siweMessage: challenge.message,
      signature
    });

    expect(result.success).toBe(true);
    expect(result.isCryptographicallyVerified).toBe(true);
    expect(result.atprotoRecord).toBeDefined();

    const storedRecord = identityLinkService.getAttestationRecord(did);
    expect(storedRecord).toBeDefined();
    expect(storedRecord.web3Address.toLowerCase()).toBe(wallet.address.toLowerCase());
  });
});
