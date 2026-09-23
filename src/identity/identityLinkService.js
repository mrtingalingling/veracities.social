/**
 * Cross-Protocol Identity Link & Conflict-of-Interest Recusal Service
 * Links ATProto DIDs (clearCloud social users) to Web3 DIDs (veracities.social stakers).
 * Guards Courtroom juries against financial bias by detecting active market stakes.
 */

export class IdentityLinkService {
  constructor() {
    this.atprotoToWeb3 = new Map();
    this.web3ToAtproto = new Map();
  }

  /**
   * Cryptographically or administratively links an ATProto DID to an EVM Web3 address.
   */
  linkIdentities(atprotoDid, web3Address, signature = null) {
    if (!atprotoDid || !web3Address) {
      throw new Error('Both atprotoDid and web3Address are required');
    }

    const normalizedWeb3 = web3Address.toLowerCase();
    this.atprotoToWeb3.set(atprotoDid, normalizedWeb3);
    this.web3ToAtproto.set(normalizedWeb3, atprotoDid);

    return {
      success: true,
      atprotoDid,
      web3Address: normalizedWeb3,
      linkedAt: Date.now()
    };
  }

  resolveWeb3(atprotoDid) {
    return this.atprotoToWeb3.get(atprotoDid) || null;
  }

  resolveAtproto(web3Address) {
    return this.web3ToAtproto.get(web3Address.toLowerCase()) || null;
  }

  /**
   * Queries whether an identity (ATProto or Web3) holds an active wager on a given market,
   * triggering automatic recusal from jury duty.
   */
  checkConflictOfInterest(userDid, marketId, validationMarket) {
    if (!validationMarket || !marketId) {
      return { hasConflict: false };
    }

    const linkedWeb3 = this.resolveWeb3(userDid);
    const linkedAtproto = this.resolveAtproto(userDid);

    const stakes = validationMarket.stakes.get(marketId) || [];
    
    // Check if user's direct ID or linked address is among the stakers
    const matchingStake = stakes.find(s => {
      const sDid = s.stakerDid.toLowerCase();
      return sDid === userDid.toLowerCase() || 
             (linkedWeb3 && sDid === linkedWeb3) || 
             (linkedAtproto && sDid === linkedAtproto.toLowerCase());
    });

    if (matchingStake) {
      return {
        hasConflict: true,
        stakerDid: matchingStake.stakerDid,
        stakedAmount: matchingStake.amount,
        outcome: matchingStake.outcome,
        recusalReason: `Identity holds an active $${matchingStake.amount} financial wager on outcome [${matchingStake.outcome}] in market ${marketId}.`
      };
    }

    return { hasConflict: false };
  }
}

export const identityLinkService = new IdentityLinkService();
