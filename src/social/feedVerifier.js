/**
 * Layer 1.1 / Layer 1: Social Feed Verifier & Groundedness Ranking
 * Implements Groundedness Index (G) and Asymmetric Hidden Reputation Dynamics.
 */

export class FeedVerifier {
  constructor() {
    this.userReputations = new Map(); // userDid -> hidden reputation score (0 to 100)
  }

  /**
   * Calculates the Groundedness Index (G) for a post according to the PRD formula:
   * G = Facts / (Facts + Speculation + (Falsehood * 3))
   * @param {Object} metrics
   * @param {number} [metrics.factsPct=0]
   * @param {number} [metrics.opinionPct=0] (Speculation)
   * @param {number} [metrics.falsehoodPct=0] (Debunked)
   * @returns {number} Score from 0.0 to 1.0
   */
  calculateGroundednessIndex(metrics = {}) {
    const facts = Math.max(0, Number(metrics.factsPct || 0));
    const speculation = Math.max(0, Number(metrics.opinionPct || 0));
    const falsehood = Math.max(0, Number(metrics.falsehoodPct || 0));

    const denominator = facts + speculation + (falsehood * 3);
    if (denominator <= 0) return 0.5; // neutral baseline

    const g = facts / denominator;
    return Math.round(g * 1000) / 1000;
  }

  /**
   * Retrieve a user's hidden reputation score (default: 50.0).
   * Hidden by default from public UI to prevent gaming.
   * @param {string} userDid 
   * @returns {number}
   */
  getHiddenReputation(userDid) {
    if (!this.userReputations.has(userDid)) {
      this.userReputations.set(userDid, 50.0);
    }
    return this.userReputations.get(userDid);
  }

  /**
   * Adjusts reputation with asymmetric dynamics ("Trust is hard to build, fast to lose"):
   * - Verified facts: gradual accrual (+0.5 to +2.0)
   * - Debunked falsehood / ragebait: swift, high penalty (-15.0 to -30.0)
   * @param {string} userDid 
   * @param {'VERIFIED_POST'|'DEBUNKED_POST'|'RAGEBAIT_FLAG'|'JURY_CONSENSUS_AFFIRM'|'COURTROOM_SLASHED'} action 
   * @returns {number} New reputation score
   */
  adjustHiddenReputation(userDid, action) {
    let current = this.getHiddenReputation(userDid);

    switch (action) {
      case 'VERIFIED_POST':
        current += 1.5; // slow deliberate accrual
        break;
      case 'JURY_CONSENSUS_AFFIRM':
        current += 2.0;
        break;
      case 'DEBUNKED_POST':
        current -= 18.0; // severe penalty
        break;
      case 'RAGEBAIT_FLAG':
        current -= 12.0; // swift penalty
        break;
      case 'COURTROOM_SLASHED':
        current -= 25.0; // catastrophic penalty
        break;
      default:
        break;
    }

    // Clamp between 0.0 and 100.0
    const clamped = Math.max(0, Math.min(100, Math.round(current * 10) / 10));
    this.userReputations.set(userDid, clamped);
    return clamped;
  }

  /**
   * Computes the algorithmic visibility multiplier across Social Circles:
   * Tier 1 (Close Friends), Tier 2 (Friends/Acquaintances), Tier 3 (Network-Wide).
   * @param {Object} post
   * @param {string} post.authorDid
   * @param {Object} post.metrics
   * @param {1|2|3} [circleTier=3]
   * @param {boolean} [filterRageBait=false]
   * @returns {Object} Visibility score and recommendation
   */
  rankPostVisibility(post, circleTier = 3, filterRageBait = false) {
    const gIndex = this.calculateGroundednessIndex(post.metrics);
    const rep = this.getHiddenReputation(post.authorDid);

    // Tier 1 preserves intimate personal updates unless rage-bait scrubber is active
    if (circleTier === 1) {
      if (filterRageBait && gIndex < 0.25) {
        return {
          visible: false,
          score: 0,
          reason: 'Filtered by Tier 1 Personal Rage-Bait Scrubber'
        };
      }
      return { visible: true, score: 1.0, reason: 'Tier 1 Close Circle Priority' };
    }

    // Tiers 2 & 3: Visibility = Groundedness (60%) + Reputation (40%)
    const compositeScore = (gIndex * 0.6) + ((rep / 100) * 0.4);
    const isVisible = compositeScore >= 0.35 && rep >= 20.0;

    return {
      visible: isVisible,
      score: Math.round(compositeScore * 100) / 100,
      groundednessIndex: gIndex,
      authorReputationTier: rep >= 75 ? 'HIGH' : rep >= 40 ? 'STANDARD' : 'THROTTLED',
      reason: isVisible ? 'Meets epistemic distribution standards' : 'Throttled due to low groundedness or reputation penalty'
    };
  }
}

export const feedVerifier = new FeedVerifier();
