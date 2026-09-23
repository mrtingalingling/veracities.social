import { describe, it, expect } from 'vitest';
import { DaoRegistry } from '../src/governance/daoRegistry.js';
import {
  calculateEQ,
  getEpistemicTier,
  ZkSemaphoreBridge,
  EPISTEMIC_TIERS
} from '../src/governance/zkSemaphoreBridge.js';

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

  describe('Layer 3: Epistemic Quotient (EQ) & Non-Plutocratic Governance (PRD §6.1)', () => {
    it('accurately computes EQ via multi-dimensional weighted formula', () => {
      // High factuality (90), strong bridging consensus (80), good steel-manning (70), low toxicity (5)
      // EQ = 0.40*90 + 0.30*80 + 0.20*70 - 0.30*5 = 36 + 24 + 14 - 1.5 = 72.5
      const metrics = {
        factuality: 90,
        bridging: 80,
        steelManning: 70,
        toxicity: 5
      };
      const eq = calculateEQ(metrics);
      expect(eq).toBe(72.5);

      const tier = getEpistemicTier(eq);
      expect(tier.tierKey).toBe('TIER_2_CONTRIBUTOR');
      expect(tier.votingPower).toBe(5);
    });

    it('rewards Sage Elders with Tier 4 voting power for exceptional bridging and factuality', () => {
      // 95 Factuality, 95 Bridging, 90 Steel-Manning, 0 Toxicity
      // EQ = 0.4*95 + 0.3*95 + 0.2*90 - 0 = 38 + 28.5 + 18 = 84.5 (Tier 3)
      // With 100 Factuality, 100 Bridging, 100 Steel-Manning:
      // EQ = 0.4*100 + 0.3*100 + 0.2*100 = 90 (Tier 4)
      const metrics = { factuality: 100, bridging: 100, steelManning: 100, toxicity: 0 };
      const eq = calculateEQ(metrics);
      expect(eq).toBe(90);

      const tier = getEpistemicTier(eq);
      expect(tier.tierKey).toBe('TIER_4_SAGE');
      expect(tier.votingPower).toBe(30);
    });

    it('penalizes toxic bad-faith behavior and suppresses voting weight', () => {
      const toxicMetrics = { factuality: 60, bridging: 20, steelManning: 10, toxicity: 80 };
      // EQ = 0.4*60 + 0.3*20 + 0.2*10 - 0.3*80 = 24 + 6 + 2 - 24 = 8.0
      const eq = calculateEQ(toxicMetrics);
      expect(eq).toBe(8.0);

      const tier = getEpistemicTier(eq);
      expect(tier.tierKey).toBe('TIER_1_NOVICE');
      expect(tier.votingPower).toBe(1);
    });
  });

  describe('Layer 3: Anonymous Semaphore ZK-SNARK Identity Bridge (PRD §6.2)', () => {
    it('registers an identity commitment in the private Merkle tree and generates a valid inclusion proof', () => {
      const zkBridge = new ZkSemaphoreBridge();
      const secret = 'user_secret_entropy_123';
      const nullifier = 'user_nullifier_seed_456';
      const commitment = zkBridge.createIdentityCommitment(secret, nullifier);

      const reg = zkBridge.registerVoterCommitment(commitment, 88.0); // Tier 3 Truth Arbiter
      expect(reg.leafIndex).toBe(0);
      expect(reg.tierKey).toBe('TIER_3_ARBITER');
      expect(reg.votingPower).toBe(15);

      const proof = zkBridge.createAnonymousProof({
        identitySecret: secret,
        identityNullifier: nullifier,
        proposalId: 'prop_treasury_allocation_2026'
      });

      expect(proof.merkleRoot).toBeDefined();
      expect(proof.nullifierHash).toBeDefined();
      expect(proof.tierClaimed).toBe('TIER_3_ARBITER');

      const verification = zkBridge.verifyAnonymousBallot(proof, 'prop_treasury_allocation_2026');
      expect(verification.valid).toBe(true);
      expect(verification.votingPower).toBe(15);
    });

    it('executes end-to-end anonymous ZK voting on DaoRegistry with double-voting prevention', () => {
      const dao = new DaoRegistry();
      const secret = 'alice_secret_alpha';
      const nullifier = 'alice_nullifier_alpha';
      const commitment = dao.zkBridge.createIdentityCommitment(secret, nullifier);

      // Register Alice as an Epistemic member with EQ 86 (Tier 3 Arbiter)
      dao.registerEpistemicMember('did:plc:alice_epistemic', {
        factuality: 95,
        bridging: 90,
        steelManning: 85,
        toxicity: 2
      }, commitment);

      const prop = dao.createProposal({
        title: 'Calibrate Courtroom AI Judge Prompting Rules',
        description: 'Enforce strict Popperian falsifiability threshold for new dockets',
        proposerDid: 'did:plc:founder',
        quorumRequired: 15
      });

      // Alice generates client-side ZK proof attesting to Tier 3 membership without disclosing her DID
      const zkProof = dao.zkBridge.createAnonymousProof({
        identitySecret: secret,
        identityNullifier: nullifier,
        proposalId: prop.proposalId
      });

      // Cast anonymous vote
      const ballot = dao.castAnonymousZkVote(prop.proposalId, zkProof, true);
      expect(ballot.isAnonymousZk).toBe(true);
      expect(ballot.voterDid).toBeNull(); // Censorship resistant: DID is completely concealed
      expect(ballot.votingPower).toBe(15); // Tier 3 Arbiter weight

      const updatedProp = dao.proposals.get(prop.proposalId);
      expect(updatedProp.votesFor).toBe(15);

      // Attempt double-voting with the same identity on the same proposal -> MUST REJECT
      expect(() => {
        dao.castAnonymousZkVote(prop.proposalId, zkProof, true);
      }).toThrow(/Double-voting prevented/);

      // Evaluates proposal with quorum met
      const evaluation = dao.evaluateProposal(prop.proposalId);
      expect(evaluation.status).toBe('PASSED');
      expect(evaluation.quorumMet).toBe(true);
    });

    it('enforces Epistemic Tier threshold requirements on sensitive governance proposals', () => {
      const dao = new DaoRegistry();
      const secret = 'novice_secret';
      const nullifier = 'novice_nullifier';
      const commitment = dao.zkBridge.createIdentityCommitment(secret, nullifier);

      // Register a Novice member (Tier 1)
      dao.registerEpistemicMember('did:plc:novice_user', {
        factuality: 40,
        bridging: 30,
        steelManning: 10,
        toxicity: 10
      }, commitment);

      // Create a high-stakes constitutional proposal restricted to Tier 3 Arbiters or higher
      const prop = dao.createProposal({
        title: 'Amend Protocol Core Cryptography',
        description: 'Upgrade Semaphore curve to BN254',
        proposerDid: 'did:plc:architect',
        minTierRequired: 'TIER_3_ARBITER'
      });

      const zkProof = dao.zkBridge.createAnonymousProof({
        identitySecret: secret,
        identityNullifier: nullifier,
        proposalId: prop.proposalId
      });

      // Attempting to vote as Tier 1 should fail verification
      expect(() => {
        dao.castAnonymousZkVote(prop.proposalId, zkProof, true);
      }).toThrow(/Insufficient Epistemic Tier/);
    });
  });
});

