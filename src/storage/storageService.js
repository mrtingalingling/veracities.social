import { IpfsStorageProvider } from './providers/ipfsStorageProvider.js';
import { ArweaveStorageProvider } from './providers/arweaveStorageProvider.js';

export class DecentralizedStorageAdapter {
  constructor(options = {}) {
    this.providers = new Map();
    
    // Register default pluggable providers
    const ipfs = new IpfsStorageProvider(options.ipfs || {});
    const arweave = new ArweaveStorageProvider(options.arweave || {});

    this.registerProvider('ipfs', ipfs);
    this.registerProvider('arweave', arweave);

    // Active default provider (can be switched to Arweave, Walrus, Filecoin, etc.)
    this.activeProviderName = options.defaultProvider || 'ipfs';
  }

  registerProvider(name, providerInstance) {
    if (!name || !providerInstance) {
      throw new Error('Provider name and instance are required');
    }
    this.providers.set(name.toLowerCase(), providerInstance);
  }

  setActiveProvider(name) {
    const key = name.toLowerCase();
    if (!this.providers.has(key)) {
      throw new Error(`Cannot set active provider: "${name}" is not registered. Registered: [${Array.from(this.providers.keys()).join(', ')}]`);
    }
    this.activeProviderName = key;
    return this.getActiveProvider();
  }

  getActiveProvider() {
    return this.providers.get(this.activeProviderName);
  }

  getProviderForUri(uri) {
    if (uri.startsWith('ipfs://')) {
      return this.providers.get('ipfs');
    }
    if (uri.startsWith('ar://')) {
      return this.providers.get('arweave');
    }
    return this.getActiveProvider();
  }

  /**
   * Stores primary whistleblower evidence or corroborating document to decentralized storage.
   * @param {Object} evidenceData
   * @returns {Promise<{ uri: string, cid: string, provider: string, size: number, gatewayUrl: string, timestamp: number }>}
   */
  async storeEvidence(evidenceData) {
    const { title, claimId, authorDid, content, mimeType = 'application/json' } = evidenceData;
    if (!content) {
      throw new Error('Evidence content is required for storage');
    }

    const payload = typeof content === 'object' ? JSON.stringify(content) : String(content);
    const metadata = {
      title: title || 'Civic Evidence Submission',
      claimId: claimId || null,
      authorDid: authorDid || 'anonymous',
      mimeType,
      uploadedVia: 'VeracitiesDecentralizedStorageAdapter'
    };

    const provider = this.getActiveProvider();
    return await provider.upload(payload, metadata);
  }

  /**
   * Stores official signed jury verdict attestation to decentralized storage.
   * @param {Object} verdictRecord
   */
  async storeVerdictRecord(verdictRecord) {
    const { caseId, verdict, attestationId, confidence, jurorDids = [] } = verdictRecord;
    if (!caseId || !verdict || !attestationId) {
      throw new Error('caseId, verdict, and attestationId are required to store verdict record');
    }

    const payload = JSON.stringify(verdictRecord);
    const metadata = {
      caseId,
      verdict,
      attestationId,
      confidence,
      jurorCount: jurorDids.length,
      mimeType: 'application/json',
      recordType: 'social.veracities.courtroom.verdict'
    };

    const provider = this.getActiveProvider();
    return await provider.upload(payload, metadata);
  }

  /**
   * Fetches content by URI (auto-detecting provider scheme: ipfs://, ar://).
   */
  async fetchContent(uriOrCid) {
    const provider = this.getProviderForUri(uriOrCid);
    if (!provider) {
      throw new Error(`No compatible storage provider found for URI: ${uriOrCid}`);
    }
    return await provider.fetch(uriOrCid);
  }

  /**
   * Verifies tamper-proof integrity of data against its decentralized URI/CID.
   */
  async verifyIntegrity(uriOrCid, data) {
    const provider = this.getProviderForUri(uriOrCid);
    if (!provider) {
      throw new Error(`No compatible storage provider found for URI: ${uriOrCid}`);
    }
    return await provider.verify(uriOrCid, data);
  }
}

export const decentralizedStorageAdapter = new DecentralizedStorageAdapter();
