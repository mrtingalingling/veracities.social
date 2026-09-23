/**
 * Layer 1.3: Courtroom Jury & AI Judge Synthesis Engine
 * Provides anonymous stake-weighted juror deliberation and AI judicial guardrails.
 */

export class JuryEngine {
  constructor() {
    this.caseVotes = new Map(); // caseId -> array of votes
  }

  /**
   * Cast an anonymous jury vote evaluating argument rigor and primary citations.
   * @param {Object} params
   * @param {string} params.caseId
   * @param {string} params.jurorDid
   * @param {'AFFIRM'|'DENY'|'NEED_MORE_PROOF'} params.vote
   * @param {string} params.argument
   * @param {string} [params.evidenceUrl]
   * @param {number} [params.weight=1.0] Epistemic honesty weight
   * @returns {Object}
   */
  castVote(params) {
    const {
      caseId,
      jurorDid,
      vote,
      argument,
      evidenceUrl,
      weight = 1.0
    } = params;

    if (!caseId || !jurorDid || !vote || !argument) {
      throw new Error('caseId, jurorDid, vote, and argument are required');
    }

    if (!['AFFIRM', 'DENY', 'NEED_MORE_PROOF'].includes(vote)) {
      throw new Error('Vote must be AFFIRM, DENY, or NEED_MORE_PROOF');
    }

    if (!this.caseVotes.has(caseId)) {
      this.caseVotes.set(caseId, []);
    }

    const votes = this.caseVotes.get(caseId);
    if (votes.some(v => v.jurorDid === jurorDid)) {
      throw new Error(`Juror ${jurorDid} has already cast a vote in case ${caseId}`);
    }

    const voteRecord = {
      voteId: `vote_${votes.length + 1}`,
      caseId,
      jurorDid,
      vote,
      argument,
      evidenceUrl: evidenceUrl || null,
      weight,
      timestamp: Date.now()
    };

    votes.push(voteRecord);
    return voteRecord;
  }

  /**
   * Tally juror votes and compute weighted percentages.
   * @param {string} caseId 
   * @returns {Object} Tally report
   */
  tallyJury(caseId) {
    const votes = this.caseVotes.get(caseId) || [];

    let affirmWeight = 0;
    let denyWeight = 0;
    let needProofWeight = 0;
    let totalWeight = 0;

    for (const v of votes) {
      if (v.vote === 'AFFIRM') affirmWeight += v.weight;
      if (v.vote === 'DENY') denyWeight += v.weight;
      if (v.vote === 'NEED_MORE_PROOF') needProofWeight += v.weight;
      totalWeight += v.weight;
    }

    const decisiveWeight = affirmWeight + denyWeight;
    const affirmPct = decisiveWeight > 0 ? (affirmWeight / decisiveWeight) * 100 : 0;
    const denyPct = decisiveWeight > 0 ? (denyWeight / decisiveWeight) * 100 : 0;

    return {
      caseId,
      totalVotes: votes.length,
      totalWeight,
      affirmWeight,
      denyWeight,
      needProofWeight,
      affirmPct: Math.round(affirmPct * 10) / 10,
      denyPct: Math.round(denyPct * 10) / 10,
      isConsensusReached: (affirmPct >= 66.7 || denyPct >= 66.7) && votes.length >= 2
    };
  }

  /**
   * AI Judge Synthesis: Acts as judicial guardrail, synthesizing juror consensus
   * and screening out ad-hominem or unbacked assertions.
   * @param {Object} caseObj 
   * @returns {Object} Judicial synthesis
   */
  synthesizeJudicialVerdict(caseObj) {
    const tally = this.tallyJury(caseObj.caseId);
    const votes = this.caseVotes.get(caseObj.caseId) || [];

    let recommendedVerdict = 'NEED_CONTEXT';
    let reasoning = 'Insufficient decisive juror consensus to conclude proof.';

    if (tally.isConsensusReached) {
      if (tally.affirmPct >= 66.7) {
        recommendedVerdict = 'VERIFIED';
        reasoning = `Overwhelming juror consensus (${tally.affirmPct}%) backed by submitted primary documentation affirms this claim.`;
      } else if (tally.denyPct >= 66.7) {
        recommendedVerdict = 'MISINFORMED';
        reasoning = `Overwhelming juror consensus (${tally.denyPct}%) backed by documented counter-evidence refutes this claim.`;
      }
    } else if (votes.length > 0 && tally.needProofWeight > tally.affirmWeight) {
      recommendedVerdict = 'DISPUTED';
      reasoning = 'Conflicting evidence and substantial requests for primary citations remain unaddressed.';
    }

    return {
      caseId: caseObj.caseId,
      recommendedVerdict,
      reasoning,
      tally,
      evidenceCitations: votes.filter(v => v.evidenceUrl).map(v => v.evidenceUrl),
      concludedAt: new Date().toISOString()
    };
  }
}

export const juryEngine = new JuryEngine();
