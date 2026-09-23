import { AuthProvider } from './authProvider.js';

export class Web3NftAuthProvider extends AuthProvider {
  constructor(options = {}) {
    super('web3_nft');
    this.chainId = options.chainId || 1; // 1 = Ethereum Mainnet
    this.supportedTokenContracts = options.tokenContracts || [];
  }

  generateSiweMessage(params) {
    const { address, chainId = this.chainId, nonce, domain = 'veracities.social', uri = 'https://veracities.social' } = params;
    const issuedAt = new Date().toISOString();
    return (
      `${domain} wants you to sign in with your Ethereum account:\n` +
      `${address}\n\n` +
      `Sign in with Ethereum to prove ownership of your Web3 identity and associated tokens.\n\n` +
      `URI: ${uri}\n` +
      `Version: 1\n` +
      `Chain ID: ${chainId}\n` +
      `Nonce: ${nonce || Math.random().toString(36).substring(2, 12)}\n` +
      `Issued At: ${issuedAt}`
    );
  }

  async resolveDid(address) {
    if (!address || !address.startsWith('0x')) {
      throw new Error('Invalid Ethereum address format');
    }
    return `did:pkh:eip155:${this.chainId}:${address.toLowerCase()}`;
  }

  async authenticate(credentials) {
    const { address, signature, message, ownedNfts = [] } = credentials;

    if (!address || !signature) {
      throw new Error('Web3 authentication requires address and cryptographic signature');
    }

    const did = await this.resolveDid(address);
    const hasRequiredToken = this.supportedTokenContracts.length === 0 ||
      ownedNfts.some(nft => this.supportedTokenContracts.includes(nft.contractAddress));

    return {
      success: true,
      provider: 'web3_nft',
      did,
      address,
      tokenGatedAccess: hasRequiredToken,
      ownedTokens: ownedNfts,
      accessJwt: `web3_jwt_${address.slice(0, 8)}_${Date.now()}`
    };
  }

  async verifySession(accessJwt) {
    return {
      valid: accessJwt && accessJwt.startsWith('web3_jwt_'),
      provider: 'web3_nft'
    };
  }
}
