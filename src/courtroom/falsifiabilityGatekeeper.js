/**
 * Layer 1.3: Courtroom Falsifiability Gatekeeper
 * Evaluates whether submitted claims are empirically testable and falsifiable
 * or whether they represent unprovable subjective preferences, aesthetic judgements,
 * or metaphysical beliefs.
 */

// Markers of unprovable aesthetic, subjective, or metaphysical claims
const SUBJECTIVE_INDICATORS = [
  /\b(?:better|worse|best|worst|greatest|ugliest|coolest|nicest|favorite)\s+than\b/i,
  /\b(?:is|are)\s+(?:better|worse|the best|the worst|superior|inferior)\b/i,
  /\b(?:god|allah|yahweh|karma|heaven|hell|reincarnation|soul)\s+(?:exists|is real|is wicked|is righteous)\b/i,
  /\b(?:is|are)\s+(?:wicked|evil|blessed|cursed|saintly|morally superior)\b/i,
  /\b(?:tastes?\s+better|looks?\s+uglier|sounds?\s+sweeter)\b/i,
  /\b(?:jazz is better than rock|rock is better than jazz)\b/i
];

// Markers indicating empirical, falsifiable, or measurable claims
const EMPIRICAL_INDICATORS = [
  /\b(?:filed for bankruptcy|signed the bill|passed the law|enacted|vetoed)\b/i,
  /\b(?:increased by|decreased by|rose to|fell to|reached)\s+\d+/i,
  /\b\d+(?:\.\d+)?\s*(?:%|ppm|mm|cm|km|meters|feet|dollars|usd|degrees|celsius|fahrenheit)\b/i,
  /\b(?:landed on|discovered|published in|patent|fda approved|cdc reported)\b/i,
  /\b(?:in\s+19\d\d|in\s+20\d\d|on\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i
];

export class FalsifiabilityGatekeeper {
  /**
   * Assesses a claim for courtroom admissibility.
   * @param {string} claimText 
   * @returns {Object} Admissibility report
   */
  evaluateClaim(claimText) {
    if (!claimText || typeof claimText !== 'string' || claimText.trim().length < 5) {
      return {
        admitted: false,
        reason: 'Claim text is too short or empty for formal courtroom trial.',
        category: 'INVALID_INPUT'
      };
    }

    const clean = claimText.trim();

    // 1. Check for subjective, aesthetic, or metaphysical assertions
    for (const pattern of SUBJECTIVE_INDICATORS) {
      if (pattern.test(clean)) {
        return {
          admitted: false,
          claimText: clean,
          reason: 'Unverifiable subjective statement, aesthetic preference, or metaphysical belief.',
          category: 'SUBJECTIVE_UNVERIFIABLE'
        };
      }
    }

    // 2. Check for empirical or testable indicators
    let hasEmpiricalSignal = false;
    for (const pattern of EMPIRICAL_INDICATORS) {
      if (pattern.test(clean)) {
        hasEmpiricalSignal = true;
        break;
      }
    }

    // Default to admitting factual assertions
    return {
      admitted: true,
      claimText: clean,
      category: hasEmpiricalSignal ? 'EMPIRICAL_MEASURABLE' : 'TESTABLE_PROPOSITION',
      guidance: 'Case admitted to Courtroom docket. Evidence submission and juror deliberation unlocked.'
    };
  }
}

export const falsifiabilityGatekeeper = new FalsifiabilityGatekeeper();
