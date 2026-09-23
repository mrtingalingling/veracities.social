import { BskyAgent } from '@atproto/api';
import { AuthProvider } from './authProvider.js';

export class AtprotoAuthProvider extends AuthProvider {
  constructor(serviceUrl = 'https://bsky.social', options = {}) {
    super('atproto');
    this.serviceUrl = serviceUrl;
    this.agent = new BskyAgent({ service: this.serviceUrl });
    this.isTestEnv = options.isTestEnv || false;
  }

  async authenticate(credentials) {
    const { identifier, password, mock } = credentials;

    if (this.isTestEnv || mock) {
      const mockDid = identifier.startsWith('did:') 
        ? identifier 
        : `did:plc:${identifier.replace(/[^a-zA-Z0-9]/g, '') || 'mockuser'}`;
      return {
        success: true,
        provider: 'atproto',
        did: mockDid,
        handle: identifier.includes('.') ? identifier : `${identifier}.bsky.social`,
        accessJwt: `mock_jwt_${Date.now()}`,
        refreshJwt: `mock_refresh_${Date.now()}`
      };
    }

    if (!identifier || !password) {
      throw new Error('ATProto authentication requires identifier (handle/email) and password');
    }

    try {
      const response = await this.agent.login({ identifier, password });
      return {
        success: true,
        provider: 'atproto',
        did: response.data.did,
        handle: response.data.handle,
        email: response.data.email,
        accessJwt: response.data.accessJwt,
        refreshJwt: response.data.refreshJwt
      };
    } catch (err) {
      return {
        success: false,
        provider: 'atproto',
        error: err.message || 'ATProto authentication failed'
      };
    }
  }

  async resolveDid(identifier) {
    if (identifier.startsWith('did:')) return identifier;
    if (this.isTestEnv) {
      return `did:plc:${identifier.replace(/[^a-zA-Z0-9]/g, '')}`;
    }
    try {
      const res = await this.agent.resolveHandle({ handle: identifier });
      return res.data.did;
    } catch (err) {
      throw new Error(`Failed to resolve handle ${identifier}: ${err.message}`);
    }
  }

  async verifySession(accessJwt) {
    if (this.isTestEnv && accessJwt.startsWith('mock_jwt_')) {
      return { valid: true, did: 'did:plc:mockuser' };
    }
    if (!this.agent.session) return { valid: false };
    return { valid: !!this.agent.session.did, did: this.agent.session.did };
  }
}
