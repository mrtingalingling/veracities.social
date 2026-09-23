/**
 * Layer 1.1 / Layer 3: Epistemic DAO Registry ("EnDAOsment")
 * Handles decentralized governance, truth pool parameters, and collective decisions.
 */

export class DaoRegistry {
  constructor() {
    this.proposals = new Map();
    this.members = new Map(); // did -> voting power / stake
    this.votes = new Map(); // proposalId -> array of votes
  }

  registerMember(memberDid, votingPower = 100) {
    this.members.set(memberDid, votingPower);
    return { memberDid, votingPower };
  }

  createProposal(params) {
    const { title, description, proposerDid, votingPeriodMs = 7 * 24 * 60 * 60 * 1000 } = params;
    if (!title || !proposerDid) {
      throw new Error('title and proposerDid are required to create a DAO proposal');
    }

    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();
    const proposal = {
      proposalId,
      title,
      description,
      proposerDid,
      status: 'ACTIVE',
      createdAt: now,
      expiresAt: now + votingPeriodMs,
      votesFor: 0,
      votesAgainst: 0,
      quorumRequired: 100
    };

    this.proposals.set(proposalId, proposal);
    this.votes.set(proposalId, []);
    return proposal;
  }

  castVote(proposalId, voterDid, support = true) {
    if (!this.proposals.has(proposalId)) throw new Error(`Proposal not found: ${proposalId}`);
    const proposal = this.proposals.get(proposalId);
    if (proposal.status !== 'ACTIVE') throw new Error(`Proposal is ${proposal.status}`);
    if (Date.now() > proposal.expiresAt) {
      proposal.status = 'EXPIRED';
      throw new Error('Voting period has expired');
    }

    const votingPower = this.members.get(voterDid) || 10;
    const existingVotes = this.votes.get(proposalId);
    if (existingVotes.some(v => v.voterDid === voterDid)) {
      throw new Error(`Member ${voterDid} has already voted on this proposal`);
    }

    if (support) {
      proposal.votesFor += votingPower;
    } else {
      proposal.votesAgainst += votingPower;
    }

    const voteRecord = { proposalId, voterDid, support, votingPower, timestamp: Date.now() };
    existingVotes.push(voteRecord);
    return voteRecord;
  }

  evaluateProposal(proposalId) {
    if (!this.proposals.has(proposalId)) throw new Error(`Proposal not found: ${proposalId}`);
    const proposal = this.proposals.get(proposalId);
    const totalVotes = proposal.votesFor + proposal.votesAgainst;

    if (totalVotes < proposal.quorumRequired) {
      proposal.status = 'FAILED_QUORUM';
    } else if (proposal.votesFor > proposal.votesAgainst) {
      proposal.status = 'PASSED';
    } else {
      proposal.status = 'REJECTED';
    }

    return {
      proposalId,
      status: proposal.status,
      votesFor: proposal.votesFor,
      votesAgainst: proposal.votesAgainst,
      quorumMet: totalVotes >= proposal.quorumRequired
    };
  }
}
