import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { BaseStorageProvider } from '../storageProvider.js';

const RAW_CODEC = 0x55; // raw binary multicodec

export class IpfsStorageProvider extends BaseStorageProvider {
  constructor(options = {}) {
    super('ipfs');
    this.gatewayBaseUrl = options.gatewayBaseUrl || 'https://ipfs.io/ipfs/';
    this.pinnedStore = new Map(); // Content-addressed in-memory cache/pin store
  }

  _normalizeBytes(data) {
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }
    if (data instanceof Uint8Array) {
      return data;
    }
    if (Buffer.isBuffer(data)) {
      return new Uint8Array(data);
    }
    return new TextEncoder().encode(JSON.stringify(data));
  }

  /**
   * Computes deterministic RFC-compliant IPFS CIDv1 (base32) using SHA-256 multihash.
   */
  async computeCid(data) {
    const bytes = this._normalizeBytes(data);
    const hash = await sha256.digest(bytes);
    const cid = CID.create(1, RAW_CODEC, hash);
    return { cid: cid.toString(), bytes };
  }

  async upload(data, metadata = {}) {
    const { cid, bytes } = await this.computeCid(data);
    const uri = `ipfs://${cid}`;
    const timestamp = Date.now();

    const record = {
      cid,
      uri,
      provider: this.name,
      bytes,
      rawString: typeof data === 'string' ? data : (data.content || null),
      size: bytes.byteLength,
      metadata: {
        ...metadata,
        uploadedAt: new Date(timestamp).toISOString()
      },
      timestamp
    };

    this.pinnedStore.set(cid, record);
    this.pinnedStore.set(uri, record);

    return {
      uri,
      cid,
      provider: this.name,
      size: record.size,
      gatewayUrl: this.getGatewayUrl(cid),
      metadata: record.metadata,
      timestamp
    };
  }

  async fetch(uriOrCid) {
    const key = uriOrCid.replace(/^ipfs:\/\//, '');
    const record = this.pinnedStore.get(key) || this.pinnedStore.get(uriOrCid);
    if (!record) {
      throw new Error(`Content not found in IPFS pinned store: ${uriOrCid}`);
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
      cid: record.cid,
      uri: record.uri,
      data: parsed || record.bytes,
      metadata: record.metadata,
      size: record.size
    };
  }

  async verify(uriOrCid, data) {
    const { cid: calculatedCid } = await this.computeCid(data);
    const targetCid = uriOrCid.replace(/^ipfs:\/\//, '');
    return calculatedCid === targetCid;
  }

  getGatewayUrl(cid) {
    const cleanCid = cid.replace(/^ipfs:\/\//, '');
    const base = this.gatewayBaseUrl.endsWith('/') ? this.gatewayBaseUrl : `${this.gatewayBaseUrl}/`;
    return `${base}${cleanCid}`;
  }
}
