import {
  calculateEQ,
  getEpistemicTier,
  ZkSemaphoreBridge,
  EPISTEMIC_TIERS
} from './zkSemaphoreBridge.js';

export const DAO_FRAMEWORKS = {
  STANDALONE: 'STANDALONE',
  OPENZEPPELIN_GOVERNOR: 'OPENZEPPELIN_GOVERNOR',
  ARAGON_OSX: 'ARAGON_OSX',
  ZODIAC_SAFE: 'ZODIAC_SAFE',
  COMPOUND_BRAVO: 'COMPOUND_BRAVO'
};

export class DaoRegistry {
  constructor() {
    this.proposals = new Map();
    this.members = new Map(); // did -> { votingPower, eq, tierKey }
    this.votes = new Map(); // proposalId -> array of votes
    this.zkBridge = new ZkSemaphoreBridge();
    this.parentFramework = DAO_FRAMEWORKS.STANDALONE;
    this.parentDaoAddress = null;
    this.isUpgradeable = true;
    this.proxyType = 'ERC1967';
  }

  registerMember(memberDid, votingPower = 100) {
    this.members.set(memberDid, { votingPower, eq: null, tierKey: null });
    return { memberDid, votingPower };
  }

  /**
   * Registers a member based on multi-dimensional Epistemic Quotient (PRD §6.1)
   * EQ = w1*Factuality + w2*Bridging + w3*SteelManning - w4*Toxicity
   * Optionally registers their Semaphore identity commitment into the private Merkle tree (PRD §6.2)
   */
  registerEpistemicMember(memberDid, metrics, identityCommitment = null) {
    const eq = calculateEQ(metrics);
    const tier = getEpistemicTier(eq);
    const memberRecord = {
      memberDid,
      eq,
      tierKey: tier.tierKey,
      tierName: tier.name,
      votingPower: tier.votingPower,
      identityCommitment: null
    };

    if (identityCommitment) {
      const zkRecord = this.zkBridge.registerVoterCommitment(identityCommitment, eq);
      memberRecord.identityCommitment = identityCommitment;
      memberRecord.merkleLeafIndex = zkRecord.leafIndex;
    }

    this.members.set(memberDid, memberRecord);
    return memberRecord;
  }

  createProposal(params) {
    const {
      title,
      description,
      proposerDid,
      votingPeriodMs = 7 * 24 * 60 * 60 * 1000,
      minTierRequired = null,
      quorumRequired = 100
    } = params;

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
      quorumRequired,
      minTierRequired,
      usedNullifiers: new Set() // Tracks Semaphore nullifier hashes to prevent double-voting
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

    const member = this.members.get(voterDid);
    const votingPower = typeof member === 'object' && member !== null ? member.votingPower : (typeof member === 'number' ? member : 10);
    
    // Check tier threshold if proposal specifies minTierRequired
    if (proposal.minTierRequired && member?.tierKey) {
      const requiredMin = EPISTEMIC_TIERS[proposal.minTierRequired]?.minEq || 0;
      const memberMin = EPISTEMIC_TIERS[member.tierKey]?.minEq || 0;
      if (memberMin < requiredMin) {
        throw new Error(`Insufficient Epistemic Tier: requires ${proposal.minTierRequired}`);
      }
    }

    const existingVotes = this.votes.get(proposalId);
    if (existingVotes.some(v => v.voterDid === voterDid)) {
      throw new Error(`Member ${voterDid} has already voted on this proposal`);
    }

    if (support) {
      proposal.votesFor += votingPower;
    } else {
      proposal.votesAgainst += votingPower;
    }

    const voteRecord = { proposalId, voterDid, support, votingPower, isAnonymousZk: false, timestamp: Date.now() };
    existingVotes.push(voteRecord);
    return voteRecord;
  }

  /**
   * Casts an Anonymous ZK-SNARK Ballot (Semaphore Protocol)
   * The voter's DID and identity are completely concealed.
   * Double-voting is cryptographically prohibited by checking proof.nullifierHash.
   */
  castAnonymousZkVote(proposalId, zkProof, support = true) {
    if (!this.proposals.has(proposalId)) throw new Error(`Proposal not found: ${proposalId}`);
    const proposal = this.proposals.get(proposalId);
    if (proposal.status !== 'ACTIVE') throw new Error(`Proposal is ${proposal.status}`);
    if (Date.now() > proposal.expiresAt) {
      proposal.status = 'EXPIRED';
      throw new Error('Voting period has expired');
    }

    // 1. Verify Semaphore ZK Proof
    const verification = this.zkBridge.verifyAnonymousBallot(zkProof, proposalId, proposal.minTierRequired);
    if (!verification.valid) {
      throw new Error(`ZK Ballot Verification Failed: ${verification.reason}`);
    }

    // 2. Enforce Nullifier Hash uniqueness per proposal scope
    if (proposal.usedNullifiers.has(verification.nullifierHash)) {
      throw new Error(`Double-voting prevented: Nullifier hash ${verification.nullifierHash.slice(0, 14)}... already consumed`);
    }

    proposal.usedNullifiers.add(verification.nullifierHash);
    const votingPower = verification.votingPower;

    if (support) {
      proposal.votesFor += votingPower;
    } else {
      proposal.votesAgainst += votingPower;
    }

    const anonymousRecord = {
      proposalId,
      voterDid: null, // Censorship-resistant anonymous ballot
      nullifierHash: verification.nullifierHash,
      support,
      votingPower,
      isAnonymousZk: true,
      timestamp: Date.now()
    };

    this.votes.get(proposalId).push(anonymousRecord);
    return anonymousRecord;
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

  setParentFramework(framework, parentDaoAddress = null) {
    if (!DAO_FRAMEWORKS[framework]) {
      throw new Error(`Unsupported DAO framework: ${framework}`);
    }
    this.parentFramework = framework;
    this.parentDaoAddress = parentDaoAddress;
    return {
      parentFramework: this.parentFramework,
      parentDaoAddress: this.parentDaoAddress
    };
  }

  getParentFramework() {
    return {
      framework: this.parentFramework,
      parentDaoAddress: this.parentDaoAddress,
      isModular: this.parentFramework !== DAO_FRAMEWORKS.STANDALONE
    };
  }

  formatFrameworkDispatchPayload(proposalId, target, value = 0, data = '0x') {
    if (!this.proposals.has(proposalId)) throw new Error(`Proposal not found: ${proposalId}`);
    const proposal = this.proposals.get(proposalId);

    switch (this.parentFramework) {
      case DAO_FRAMEWORKS.ZODIAC_SAFE:
        return {
          framework: DAO_FRAMEWORKS.ZODIAC_SAFE,
          contractMethod: 'execTransactionFromModule',
          params: {
            to: target,
            value,
            data,
            operation: 0 // Call
          },
          targetDao: this.parentDaoAddress
        };
      case DAO_FRAMEWORKS.ARAGON_OSX:
        return {
          framework: DAO_FRAMEWORKS.ARAGON_OSX,
          contractMethod: 'executeProposalHook',
          params: {
            proposalId,
            metadata: proposal.descriptionCid || 'ipfs://bafkreidemo',
            actions: [data]
          },
          targetDao: this.parentDaoAddress
        };
      case DAO_FRAMEWORKS.OPENZEPPELIN_GOVERNOR:
      case DAO_FRAMEWORKS.COMPOUND_BRAVO:
        return {
          framework: this.parentFramework,
          contractMethod: 'execute',
          params: {
            target,
            value,
            data
          },
          targetDao: this.parentDaoAddress
        };
      default:
        return {
          framework: DAO_FRAMEWORKS.STANDALONE,
          contractMethod: 'executeProposal',
          params: { proposalId },
          targetDao: null
        };
    }
  }

  getUpgradeabilityInfo() {
    return {
      isUpgradeable: this.isUpgradeable,
      proxyType: this.proxyType,
      pattern: 'UUPS (ERC-1822 / ERC-1967)',
      storageSlots: {
        implementationSlot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
      }
    };
  }
}


