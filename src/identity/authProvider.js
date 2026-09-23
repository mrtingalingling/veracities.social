/**
 * Base Abstract AuthProvider for veracities.social Protocol
 */
export class AuthProvider {
  constructor(name) {
    this.name = name;
  }

  async authenticate(credentials) {
    throw new Error('authenticate() must be implemented by subclass');
  }

  async resolveDid(identifier) {
    throw new Error('resolveDid() must be implemented by subclass');
  }

  async verifySession(sessionToken) {
    throw new Error('verifySession() must be implemented by subclass');
  }
}
