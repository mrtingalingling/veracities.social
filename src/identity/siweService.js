import { verifyMessage, getAddress } from 'ethers';

/**
 * EIP-4361 Sign-In with Ethereum (SIWE) & ATProto Identity Linkage Service
 * Provides cryptographic binding between did:plc:... and EVM wallet addresses.
 */
export class SiweLinkService {
  constructor() {
    this.usedNonces = new Set();
  }

  /**
   * Generates a random alphanumeric nonce.
   */
  generateNonce(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generates a standard EIP-4361 challenge message.
   */
  generateChallenge({
    atprotoDid,
    web3Address,
    domain = 'veracities.social',
    uri = 'https://veracities.social',
    chainId = 1,
    nonce = null,
    issuedAt = null
  }) {
    if (!atprotoDid || !web3Address) {
      throw new Error('Both atprotoDid and web3Address are required to generate SIWE challenge');
    }

    const checksumAddress = getAddress(web3Address);
    const n = nonce || this.generateNonce();
    const ts = issuedAt || new Date().toISOString();

    const statement = `Authorize linking ATProto DID ${atprotoDid} to Veracities Validation Markets and Courtroom Deliberation.`;

    const message = [
      `${domain} wants you to sign in with your Ethereum account:`,
      checksumAddress,
      '',
      statement,
      '',
      `URI: ${uri}`,
      `Version: 1`,
      `Chain ID: ${chainId}`,
      `Nonce: ${n}`,
      `Issued At: ${ts}`
    ].join('\n');

    return {
      message,
      checksumAddress,
      atprotoDid,
      nonce: n,
      issuedAt: ts,
      chainId
    };
  }

  /**
   * Verifies an EIP-4361 signature and recovers the signing address.
   */
  verifySignature({ message, signature, expectedAddress = null, expectedDid = null, maxAgeMs = 3600000 }) {
    if (!message || !signature) {
      return { success: false, reason: 'Message and signature are required' };
    }

    // Extract fields from standard message format
    const lines = message.split('\n');
    if (lines.length < 9) {
      return { success: false, reason: 'Invalid EIP-4361 message structure' };
    }

    const messageAddress = lines[1].trim();
    const nonceLine = lines.find(l => l.startsWith('Nonce: '));
    const issuedAtLine = lines.find(l => l.startsWith('Issued At: '));
    const chainIdLine = lines.find(l => l.startsWith('Chain ID: '));

    const nonce = nonceLine ? nonceLine.replace('Nonce: ', '').trim() : null;
    const issuedAt = issuedAtLine ? issuedAtLine.replace('Issued At: ', '').trim() : null;
    const chainId = chainIdLine ? parseInt(chainIdLine.replace('Chain ID: ', '').trim(), 10) : 1;

    // 1. Replay protection check
    if (nonce) {
      if (this.usedNonces.has(nonce)) {
        return { success: false, reason: 'Replay detected: nonce has already been used' };
      }
    }

    // 2. Timestamp expiration check
    if (issuedAt) {
      const issueTime = new Date(issuedAt).getTime();
      if (isNaN(issueTime) || Date.now() - issueTime > maxAgeMs) {
        return { success: false, reason: 'SIWE challenge message has expired' };
      }
    }

    // 3. Cryptographic address recovery
    let recoveredAddress;
    try {
      recoveredAddress = verifyMessage(message, signature);
    } catch (err) {
      return { success: false, reason: `Signature verification failed: ${err.message}` };
    }

    const normalizedRecovered = recoveredAddress.toLowerCase();
    const normalizedExpected = (expectedAddress || messageAddress).toLowerCase();

    if (normalizedRecovered !== normalizedExpected) {
      return {
        success: false,
        reason: `Signer mismatch: recovered ${recoveredAddress} but expected ${expectedAddress || messageAddress}`
      };
    }

    // 4. Check DID match if expected
    if (expectedDid && !message.includes(expectedDid)) {
      return { success: false, reason: `Message does not contain expected DID: ${expectedDid}` };
    }

    // Mark nonce as spent
    if (nonce) {
      this.usedNonces.add(nonce);
    }

    // Create ATProto Record payload matching lexicon schema
    const atprotoRecord = {
      $type: 'social.veracities.identity.link',
      web3Address: getAddress(recoveredAddress),
      chainId,
      statement: lines[3] || '',
      nonce,
      issuedAt,
      signature
    };

    return {
      success: true,
      recoveredAddress: getAddress(recoveredAddress),
      atprotoRecord
    };
  }
}

export const siweLinkService = new SiweLinkService();
