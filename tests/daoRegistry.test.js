import { describe, it, expect } from 'vitest';
import { DaoRegistry } from '../src/governance/daoRegistry.js';

describe('Protocol & Settlement Backend: Epistemic DAO Registry ("EnDAOsment")', () => {
  it('registers members with voting power', () => {
    const dao = new DaoRegistry();
    const member = dao.registerMember('did:plc:alice', 250);
    expect(member.memberDid).toBe('did:plc:alice');
    expect(member.votingPower).toBe(250);
  });

  it('creates and executes proposals with quorum verification', () => {
    const dao = new DaoRegistry();
    dao.registerMember('did:plc:alice', 120);
    dao.registerMember('did:plc:bob', 80);

    const prop = dao.createProposal({
      title: 'Update Protocol Slashing Ratio',
      description: 'Increase cold case maintenance fee from 6% to 7%',
      proposerDid: 'did:plc:alice'
    });

    expect(prop.status).toBe('ACTIVE');

    dao.castVote(prop.proposalId, 'did:plc:alice', true); // 120 votes for
    dao.castVote(prop.proposalId, 'did:plc:bob', false);  // 80 votes against

    const evaluation = dao.evaluateProposal(prop.proposalId);
    expect(evaluation.status).toBe('PASSED');
    expect(evaluation.votesFor).toBe(120);
    expect(evaluation.votesAgainst).toBe(80);
    expect(evaluation.quorumMet).toBe(true);
  });
});
