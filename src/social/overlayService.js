/**
 * Layer 1.1 / Layer 1: Social Platform Card & In-Feed Overlay Service
 * Formats epistemic badges and inline cards for Bluesky, X/Twitter, Reddit, and YouTube.
 */

export const VERDICT_BADGES = {
  verified: {
    label: 'Verified Claim',
    color: '#10b981', // Emerald
    icon: 'check_circle',
    badgeClass: 'vera-badge-verified'
  },
  disputed: {
    label: 'Disputed Claim',
    color: '#f59e0b', // Amber
    icon: 'warning',
    badgeClass: 'vera-badge-disputed'
  },
  misinformed: {
    label: 'Refuted / Falsehood',
    color: '#f43f5e', // Rose
    icon: 'cancel',
    badgeClass: 'vera-badge-misinformed'
  },
  'need-additional-context': {
    label: 'Needs Context',
    color: '#a855f7', // Purple
    icon: 'info',
    badgeClass: 'vera-badge-context'
  }
};

export class OverlayService {
  /**
   * Prepares an in-feed fact-checking card for social post embeds.
   * @param {Object} params
   * @param {'bluesky'|'x'|'reddit'|'youtube'} params.platform
   * @param {string} params.postId
   * @param {string} params.postText
   * @param {Object} params.analysis Vera analysis payload { verdict, confidence, metrics, claims }
   * @returns {Object} Formatted overlay card
   */
  createOverlayCard(params) {
    const { platform, postId, postText, analysis } = params;

    const verdictKey = (analysis.verdict || (analysis.claims && analysis.claims[0]?.verdict) || 'need-additional-context').toLowerCase();
    const badge = VERDICT_BADGES[verdictKey] || VERDICT_BADGES['need-additional-context'];

    return {
      cardId: `overlay_${platform}_${postId}`,
      platform,
      postId,
      verdict: verdictKey,
      badgeLabel: badge.label,
      badgeColor: badge.color,
      badgeIcon: badge.icon,
      confidence: analysis.confidence || 85,
      metrics: {
        factsPct: analysis.metrics?.factsPct ?? 80,
        opinionPct: analysis.metrics?.opinionPct ?? 20,
        falsehoodPct: analysis.metrics?.falsehoodPct ?? 0
      },
      sources: (analysis.claims && analysis.claims[0]?.sources) || ['Vera Epistemic Ledger'],
      renderedHtml: `<div class="vera-social-overlay ${badge.badgeClass}" data-verdict="${verdictKey}">` +
                    `<span class="vera-badge-icon">${badge.icon}</span> ` +
                    `<strong>${badge.label}</strong> (${analysis.confidence || 85}% confidence)` +
                    `</div>`
    };
  }
}

export const overlayService = new OverlayService();
