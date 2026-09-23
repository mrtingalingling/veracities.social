import { describe, it, expect } from 'vitest';
import { falsifiabilityGatekeeper } from '../src/courtroom/falsifiabilityGatekeeper.js';
import { CaseManager, CASE_STATUS } from '../src/courtroom/caseManager.js';
import { JuryEngine } from '../src/courtroom/juryEngine.js';

describe('Layer 1.3: Courtroom Falsifiability Gatekeeper', () => {
  it('admits empirical, testable, and falsifiable claims', () => {
    const claim1 = 'Company X filed for bankruptcy on Tuesday';
    const claim2 = 'Atmospheric CO2 reached 420 ppm in 2024';

    const check1 = falsifiabilityGatekeeper.evaluateClaim(claim1);
    const check2 = falsifiabilityGatekeeper.evaluateClaim(claim2);

    expect(check1.admitted).toBe(true);
    expect(check2.admitted).toBe(true);
  });

  it('rejects subjective, aesthetic, or metaphysical claims with reason tag', () => {
    const claim1 = 'Jazz is better than rock';
    const claim2 = 'Chocolate ice cream is superior';
    const claim3 = 'God exists and is righteous';

    const check1 = falsifiabilityGatekeeper.evaluateClaim(claim1);
    const check2 = falsifiabilityGatekeeper.evaluateClaim(claim2);
    const check3 = falsifiabilityGatekeeper.evaluateClaim(claim3);

    expect(check1.admitted).toBe(false);
    expect(check1.reason).toContain('Unverifiable subjective statement');
    expect(check2.admitted).toBe(false);
    expect(check3.admitted).toBe(false);
  });
});

describe('Layer 1.3: Courtroom Case Lifecycle & Deliberation', () => {
  it('dockets a verifiable case and performs DAG decomposition on compound claims', () => {
    const manager = new CaseManager();
    const compoundClaim = 'Vaccine X was banned in Country Y because it caused 500 cardiac arrests';

    const c = manager.openCase({
      title: 'Investigation of Vaccine X Regulatory Actions',
      claimText: compoundClaim,
      creatorDid: 'did:plc:creator123',
      initialDeposit: 100
    });

    expect(c.caseId).toBe('case_1');
    expect(c.status).toBe(CASE_STATUS.OPEN);
    expect(c.isDagCompound).toBe(true);
    expect(c.dagNodes.length).toBe(2);
    expect(c.dagNodes[0].text).toContain('Vaccine X was banned in Country Y');
    expect(c.dagNodes[1].text).toContain('It caused 500 cardiac arrests');
    expect(c.dagNodes[1].dependencies).toContain('sub_0');
  });

  it('rejects docketing of non-falsifiable subjective claims', () => {
    const manager = new CaseManager();
    expect(() => {
      manager.openCase({
        title: 'Music Quality Debate',
        claimText: 'Jazz is better than rock music',
        creatorDid: 'did:plc:musician'
      });
    }).toThrow('Courtroom Rejection');
  });

  it('executes 14-day cold case refund mechanism (94% refund, 6% fee)', () => {
    const manager = new CaseManager();
    const c = manager.openCase({
      title: 'Stale Investigation Claim',
      claimText: 'Local bridge traffic decreased by 15% in 2023',
      creatorDid: 'did:plc:alice',
      initialDeposit: 500
    });

    manager.depositWager(c.caseId, 'did:plc:bob', 500); // Total pool = 1000

    // Simulate 15 days later
    const fifteenDaysLater = Date.now() + (15 * 24 * 60 * 60 * 1000);
    const coldReport = manager.checkColdStatus(c.caseId, fifteenDaysLater);

    expect(coldReport.isCold).toBe(true);
    expect(coldReport.status).toBe(CASE_STATUS.COLD);
    expect(coldReport.originalPool).toBe(1000);
    expect(coldReport.platformFee).toBe(60); // 6% of 1000
    expect(coldReport.totalRefunded).toBe(940); // 94% of 1000
    expect(coldReport.refunds.length).toBe(2);
    expect(coldReport.refunds[0].refunded).toBe(470);
    expect(coldReport.refunds[1].refunded).toBe(470);
  });

  it('manages appeal retrials with challenge bond and payout rewards', () => {
    const manager = new CaseManager();
    const c = manager.openCase({
      title: 'Historical Document Claim',
      claimText: 'Historical treaty signed on July 4 1920',
      creatorDid: 'did:plc:historian',
      initialDeposit: 200
    });

    // Initial settlement as MISINFORMED
    manager.settleCase({
      caseId: c.caseId,
      finalVerdict: 'MISINFORMED',
      judgeSummary: 'Initial jury concluded date was incorrect.'
    });

    // Challenger posts challenge bond of 300 with fresh primary archive evidence
    const appeal = manager.appealCase({
      caseId: c.caseId,
      challengerDid: 'did:plc:challenger',
      challengeBond: 300,
      freshEvidence: 'https://nationalarchives.gov/treaty-scan.pdf',
      reason: 'Newly declassified treaty shows July 4 1920 signature was authentic'
    });

    expect(appeal.appealId).toBe('appeal_1');
    expect(c.status).toBe(CASE_STATUS.APPEALED);

    // Retrial overturns verdict to VERIFIED
    const settlement = manager.settleAppeal(c.caseId, 'VERIFIED');
    expect(settlement.isOverturned).toBe(true);
    expect(settlement.challengerResult.outcome).toBe('OVERTURNED');
    expect(settlement.challengerResult.bondReturned).toBe(300);
    expect(settlement.challengerResult.bountyReward).toBe(150); // 50% reward
    expect(settlement.challengerResult.totalPayout).toBe(450);
  });
});

describe('Layer 1.3: Jury Voting & AI Judge Guardrails', () => {
  it('tallies weighted juror votes and synthesizes judicial verdict', () => {
    const jury = new JuryEngine();
    const caseId = 'case_test_99';

    jury.castVote({
      caseId,
      jurorDid: 'did:plc:juror1',
      vote: 'AFFIRM',
      argument: 'Confirmed by primary peer-reviewed data in Nature 2024',
      evidenceUrl: 'https://nature.com/articles/s41586-024-test',
      weight: 10.0
    });

    jury.castVote({
      caseId,
      jurorDid: 'did:plc:juror2',
      vote: 'AFFIRM',
      argument: 'Verified against satellite ground telemetry',
      weight: 5.0
    });

    const tally = jury.tallyJury(caseId);
    expect(tally.affirmWeight).toBe(15.0);
    expect(tally.affirmPct).toBe(100.0);
    expect(tally.isConsensusReached).toBe(true);

    const judgeSynthesis = jury.synthesizeJudicialVerdict({ caseId });
    expect(judgeSynthesis.recommendedVerdict).toBe('VERIFIED');
    expect(judgeSynthesis.reasoning).toContain('Overwhelming juror consensus');
    expect(judgeSynthesis.evidenceCitations.length).toBe(1);
  });
});
