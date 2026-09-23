import crypto from 'crypto';
import { BaseStorageProvider } from '../storageProvider.js';

export class ArweaveStorageProvider extends BaseStorageProvider {
  constructor(options = {}) {
    super('arweave');
    this.gatewayBaseUrl = options.gatewayBaseUrl || 'https://arweave.net/';
    this.pinnedStore = new Map();
  }

  _normalizeBytes(data) {
    if (typeof data === 'string') {
      return Buffer.from(data, 'utf8');
    }
    if (Buffer.isBuffer(data)) {
      return data;
    }
    if (data instanceof Uint8Array) {
      return Buffer.from(data);
    }
    return Buffer.from(JSON.stringify(data), 'utf8');
  }

  /**
   * Computes deterministic Arweave transaction ID format (base64url SHA-256).
   */
  computeTxId(data) {
    const bytes = this._normalizeBytes(data);
    const hash = crypto.createHash('sha256').update(bytes).digest();
    // Base64url encode without padding (43 chars)
    const txId = hash.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return { txId, bytes };
  }

  async upload(data, metadata = {}) {
    const { txId, bytes } = this.computeTxId(data);
    const uri = `ar://${txId}`;
    const timestamp = Date.now();

    const record = {
      txId,
      uri,
      provider: this.name,
      bytes,
      rawString: typeof data === 'string' ? data : (data.content || null),
      size: bytes.length,
      metadata: {
        ...metadata,
        uploadedAt: new Date(timestamp).toISOString()
      },
      timestamp
    };

    this.pinnedStore.set(txId, record);
    this.pinnedStore.set(uri, record);

    return {
      uri,
      cid: txId,
      provider: this.name,
      size: record.size,
      gatewayUrl: this.getGatewayUrl(txId),
      metadata: record.metadata,
      timestamp
    };
  }

  async fetch(uriOrTxId) {
    const key = uriOrTxId.replace(/^ar:\/\//, '');
    const record = this.pinnedStore.get(key) || this.pinnedStore.get(uriOrTxId);
    if (!record) {
      throw new Error(`Content not found in Arweave pinned store: ${uriOrTxId}`);
    }

    let parsed = record.rawString;
    try {
      if (parsed) {
        parsed = JSON.parse(parsed);
      }
    } catch {
      // Return raw string if not JSON
    }

    return {
      cid: record.txId,
      uri: record.uri,
      data: parsed || record.bytes,
      metadata: record.metadata,
      size: record.size
    };
  }

  async verify(uriOrTxId, data) {
    const { txId: calculatedTxId } = this.computeTxId(data);
    const targetTxId = uriOrTxId.replace(/^ar:\/\//, '');
    return calculatedTxId === targetTxId;
  }

  getGatewayUrl(txId) {
    const cleanId = txId.replace(/^ar:\/\//, '');
    const base = this.gatewayBaseUrl.endsWith('/') ? this.gatewayBaseUrl : `${this.gatewayBaseUrl}/`;
    return `${base}${cleanId}`;
  }
}
