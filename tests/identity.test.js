import { describe, it, expect } from 'vitest';
import { createAuthProvider, AtprotoAuthProvider, Web3NftAuthProvider } from '../src/identity/index.js';

describe('Protocol & Settlement Backend: Identity Subsystem', () => {
  it('creates an ATProto provider and authenticates a test user', async () => {
    const provider = createAuthProvider('atproto', { isTestEnv: true });
    expect(provider).toBeInstanceOf(AtprotoAuthProvider);

    const session = await provider.authenticate({ identifier: 'alice.bsky.social', mock: true });
    expect(session.success).toBe(true);
    expect(session.provider).toBe('atproto');
    expect(session.did).toBe('did:plc:alicebskysocial');
    expect(session.handle).toBe('alice.bsky.social');
    expect(session.accessJwt).toBeDefined();
  });

  it('resolves ATProto DIDs correctly', async () => {
    const provider = createAuthProvider('atproto', { isTestEnv: true });
    const resolved = await provider.resolveDid('bob.bsky.social');
    expect(resolved).toBe('did:plc:bobbskysocial');

    const explicitDid = await provider.resolveDid('did:plc:z72i7hdynmk6r22z27h6tvur');
    expect(explicitDid).toBe('did:plc:z72i7hdynmk6r22z27h6tvur');
  });

  it('creates a Web3 NFT provider and generates EIP-4361 SIWE message', () => {
    const provider = createAuthProvider('web3_nft', { chainId: 1 });
    expect(provider).toBeInstanceOf(Web3NftAuthProvider);

    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const msg = provider.generateSiweMessage({ address, nonce: 'nonce123' });

    expect(msg).toContain('veracities.social wants you to sign in with your Ethereum account');
    expect(msg).toContain(address);
    expect(msg).toContain('Chain ID: 1');
    expect(msg).toContain('Nonce: nonce123');
  });

  it('resolves W3C DID:PKH for Ethereum addresses', async () => {
    const provider = createAuthProvider('web3_nft', { chainId: 1 });
    const did = await provider.resolveDid('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(did).toBe('did:pkh:eip155:1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
  });

  it('authenticates Web3 user and validates NFT token gate placeholder', async () => {
    const tokenContract = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D'; // BAYC
    const provider = createAuthProvider('web3_nft', { tokenContracts: [tokenContract] });

    const authPayload = await provider.authenticate({
      address: '0x1234567890123456789012345678901234567890',
      signature: '0xabcdef...',
      ownedNfts: [{ contractAddress: tokenContract, tokenId: '42' }]
    });

    expect(authPayload.success).toBe(true);
    expect(authPayload.tokenGatedAccess).toBe(true);
    expect(authPayload.did).toContain('did:pkh:eip155:1:0x1234567890123456789012345678901234567890');
  });
});
