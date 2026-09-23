/**
 * Abstract Base Class for Decentralized Storage Providers.
 * Supports hot-swapping between IPFS, Arweave, Walrus, Filecoin, or Mock storage.
 */
export class BaseStorageProvider {
  constructor(name) {
    if (!name) throw new Error('Provider name is required');
    this.name = name;
  }

  /**
   * Uploads raw or string data with metadata to decentralized storage.
   * @param {string|Uint8Array|Buffer} data 
   * @param {Object} metadata 
   * @returns {Promise<{ uri: string, cid: string, provider: string, size: number, timestamp: number }>}
   */
  async upload(data, metadata = {}) {
    throw new Error('upload() must be implemented by concrete StorageProvider');
  }

  /**
   * Fetches data and metadata by URI or CID.
   * @param {string} uriOrCid 
   * @returns {Promise<{ data: any, metadata: Object }>}
   */
  async fetch(uriOrCid) {
    throw new Error('fetch() must be implemented by concrete StorageProvider');
  }

  /**
   * Verifies that the provided data matches the content-addressed URI/CID.
   * @param {string} uriOrCid 
   * @param {string|Uint8Array|Buffer} data 
   * @returns {Promise<boolean>}
   */
  async verify(uriOrCid, data) {
    throw new Error('verify() must be implemented by concrete StorageProvider');
  }

  /**
   * Returns a publicly accessible HTTP gateway URL for browser viewing.
   * @param {string} cid 
   * @returns {string}
   */
  getGatewayUrl(cid) {
    throw new Error('getGatewayUrl() must be implemented by concrete StorageProvider');
  }
}
