import { AtprotoAuthProvider } from './atprotoProvider.js';
import { Web3NftAuthProvider } from './web3NftProvider.js';

export * from './authProvider.js';
export * from './atprotoProvider.js';
export * from './web3NftProvider.js';
export * from './identityLinkService.js';
export * from './siweService.js';

export function createAuthProvider(providerType = 'atproto', options = {}) {
  switch (providerType.toLowerCase()) {
    case 'atproto':
    case 'bluesky':
      return new AtprotoAuthProvider(options.serviceUrl || 'https://bsky.social', options);
    case 'web3':
    case 'web3_nft':
    case 'nft':
      return new Web3NftAuthProvider(options);
    default:
      throw new Error(`Unsupported authentication provider type: ${providerType}`);
  }
}
