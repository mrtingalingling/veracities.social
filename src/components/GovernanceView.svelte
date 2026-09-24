<script>
  import { DaoRegistry, DAO_FRAMEWORKS } from '../governance/daoRegistry.js';
  import { ZkSemaphoreBridge, EPISTEMIC_TIERS, calculateEQ } from '../governance/zkSemaphoreBridge.js';
  import contractsConfig from '../config/contracts.json';

  let {
    userDid = 'did:pkh:eip155:1:0x71C8360f3a1591E108f20387b925b39F11FaB19',
    daoRegistry = new DaoRegistry()
  } = $props();

  // Upgradeable Contract & DAO Framework Integration State
  let selectedFramework = $state(daoRegistry.parentFramework || DAO_FRAMEWORKS.STANDALONE);
  let parentDaoAddressInput = $state(daoRegistry.parentDaoAddress || '');
  let contractInfo = $derived(contractsConfig?.contracts?.EpistemicGovernor || {
    address: '0x1fC66aF9C16e399C75E9Aa04946fbd1c7C60130B',
    implementation: '0xE93CDcdf5D53136A7212F586D58CB4ec85687BAe',
    isUpgradeable: true,
    proxyType: 'ERC1967'
  });

  // User's epistemic profile metrics
  let userMetrics = $state({
    factuality: 92,
    bridging: 85,
    steelManning: 88,
    toxicity: 0
  });

  let userEQ = $derived(calculateEQ(userMetrics));
  let userCommitment = '0x1a8f902b489c7d1e89f0321a94bc7210e349a8b1c098ef3247d52a1b9487cdef';
  let memberRecord = $state(null);
  let feedbackMessage = $state('');
  let feedbackError = $state('');
  let refreshTrigger = $state(0);

  // Proposal Creation Form
  let showCreateModal = $state(false);
  let newPropTitle = $state('');
  let newPropCid = $state('');
  let newPropMinTier = $state('CONTRIBUTOR');
  let newPropQuorum = $state(50);

  // ZK Ballot State
  let activeZkReceipt = $state(null);

  // Initialize DAO member & seed sample proposals
  $effect(() => {
    if (daoRegistry.members.size === 0) {
      memberRecord = daoRegistry.registerEpistemicMember(userDid, userMetrics, userCommitment);
    } else {
      memberRecord = daoRegistry.members.get(userDid);
    }

    if (daoRegistry.proposals.size === 0) {
      daoRegistry.createProposal({
        title: 'EIP-12: Allocate 25% of Protocol Fees to Public Goods Deliberation Subsidies',
        description: 'ipfs://bafkreihpublicgoodssubsidyproposalallocationdraftv1',
        proposerDid: 'did:plc:foundation.veracities.social',
        minTierRequired: 'CONTRIBUTOR',
        quorumRequired: 30
      });

      daoRegistry.createProposal({
        title: 'EIP-13: Upgrade Falsifiability Gatekeeper to Gemini 2.0 Flash Reasoning Engine',
        description: 'ipfs://bafkreigatekeeperreasoningupgradespecification2026',
        proposerDid: 'did:plc:core_ai_guild',
        minTierRequired: 'ARBITER',
        quorumRequired: 50
      });
      refreshTrigger += 1;
    }
  });

  let proposalList = $derived.by(() => {
    void refreshTrigger;
    return Array.from(daoRegistry.proposals.values());
  });

  function handleAnonymousZkVote(proposalId, support) {
    feedbackMessage = '';
    feedbackError = '';
    activeZkReceipt = null;

    try {
      // 1. Generate client-side Semaphore ZK Proof (PRD §6.2)
      const zkProof = daoRegistry.zkBridge.generateAnonymousProof({
        identityCommitment: userCommitment,
        userEq: userEQ,
        proposalScopeId: proposalId
      });

      // 2. Cast anonymous ballot using nullifier hash
      const voteRecord = daoRegistry.castAnonymousZkVote(proposalId, zkProof, support);
      refreshTrigger += 1;

      activeZkReceipt = {
        proposalId,
        support,
        votingWeight: voteRecord.votingPower,
        nullifierHash: voteRecord.nullifierHash,
        merkleRoot: zkProof.merkleRoot,
        tierKey: zkProof.tierKey,
        timestamp: new Date().toLocaleTimeString()
      };

      feedbackMessage = `Anonymous ZK Vote Cast Successfully! Your vote (+${voteRecord.votingPower} weight) was recorded without revealing your DID or wallet address.`;
    } catch (err) {
      feedbackError = err.message;
    }
  }

  function handleCreateProposal() {
    feedbackMessage = '';
    feedbackError = '';

    if (!newPropTitle.trim()) {
      feedbackError = 'Proposal title is required';
      return;
    }
    if (!newPropCid.startsWith('ipfs://')) {
      feedbackError = 'Description must be an RFC-compliant IPFS CID (ipfs://...)';
      return;
    }

    try {
      const prop = daoRegistry.createProposal({
        title: newPropTitle,
        description: newPropCid,
        proposerDid: userDid,
        minTierRequired: newPropMinTier,
        quorumRequired: Number(newPropQuorum)
      });

      showCreateModal = false;
      newPropTitle = '';
      newPropCid = '';
      refreshTrigger += 1;
      feedbackMessage = `Proposal Created: ${prop.proposalId}`;
    } catch (err) {
      feedbackError = err.message;
    }
  }

  function handleFrameworkChange(framework) {
    selectedFramework = framework;
    daoRegistry.setParentFramework(framework, parentDaoAddressInput || null);
    feedbackMessage = `DAO Framework binding updated: ${framework}`;
  }

  function handleUpdateParentAddress() {
    daoRegistry.setParentFramework(selectedFramework, parentDaoAddressInput || null);
    feedbackMessage = `Parent DAO address saved for ${selectedFramework}: ${parentDaoAddressInput}`;
  }
</script>

<div class="governance-container">
  <!-- Top Epistemic Passport Card -->
  <section class="passport-banner">
    <div class="passport-left">
      <div class="tier-shield">
        <span class="material-symbols-outlined shield-icon">verified_user</span>
      </div>
      <div class="passport-meta">
        <div class="passport-header-line">
          <h2>Your Epistemic Passport</h2>
          <span class="tier-pill {memberRecord?.tierKey?.toLowerCase() || 'sage'}">
            {memberRecord?.tierName || 'Sage Elder (Tier 4)'}
          </span>
        </div>
        <p class="passport-desc">
          Zero-Knowledge Anonymous Governance (PRD §6.2). Your voting weight is determined quadratically
          by intellectual honesty, factuality, and bridging consensus—completely uncoupled from token wealth.
        </p>
        <div class="merkle-status">
          <span class="status-dot"></span>
          <span>Semaphore Merkle Tree: <strong>Enrolled</strong> (Leaf Index: {memberRecord?.merkleLeafIndex ?? 0})</span>
        </div>
      </div>
    </div>

    <div class="passport-metrics">
      <div class="metric-box eq-highlight">
        <span class="m-title">Epistemic Quotient (EQ)</span>
        <span class="m-value">{Math.round(userEQ)} <span class="m-unit">/ 100</span></span>
      </div>
      <div class="metric-box">
        <span class="m-title">Quadratic Voting Power</span>
        <span class="m-value text-gold">+{memberRecord?.votingPower || 30} <span class="m-unit">Votes</span></span>
      </div>
      <div class="metric-box">
        <span class="m-title">Bridging Score</span>
        <span class="m-value text-cyan">{userMetrics.bridging}%</span>
      </div>
      <div class="metric-box">
        <span class="m-title">Factuality Accuracy</span>
        <span class="m-value text-emerald">{userMetrics.factuality}%</span>
      </div>
    </div>
  </section>

  <!-- Contract Architecture & Framework Integration Cockpit -->
  <section class="framework-banner">
    <div class="framework-header">
      <div class="framework-title-group">
        <span class="material-symbols-outlined text-purple">hub</span>
        <div>
          <h3>Contract Architecture & Multi-Framework Interoperability</h3>
          <p class="framework-sub">
            Built as an <strong>ERC-1967 / UUPS Upgradeable Proxy</strong>. Can operate standalone or plug directly into external DAO frameworks as an epistemic consensus module.
          </p>
        </div>
      </div>
      <div class="proxy-badge-group">
        <span class="proxy-pill">
          <span class="status-dot green"></span>
          UUPS Upgradeable
        </span>
        <span class="proxy-pill mono">Proxy: {contractInfo.address.slice(0, 10)}...{contractInfo.address.slice(-6)}</span>
      </div>
    </div>

    <div class="framework-selector-row">
      <span class="selector-label">Target Protocol Framework:</span>
      <div class="framework-pills">
        <button
          type="button"
          class="framework-btn {selectedFramework === DAO_FRAMEWORKS.STANDALONE ? 'active' : ''}"
          onclick={() => handleFrameworkChange(DAO_FRAMEWORKS.STANDALONE)}
        >
          Standalone (Native)
        </button>
        <button
          type="button"
          class="framework-btn {selectedFramework === DAO_FRAMEWORKS.OPENZEPPELIN_GOVERNOR ? 'active' : ''}"
          onclick={() => handleFrameworkChange(DAO_FRAMEWORKS.OPENZEPPELIN_GOVERNOR)}
        >
          OpenZeppelin Governor (IGovernor)
        </button>
        <button
          type="button"
          class="framework-btn {selectedFramework === DAO_FRAMEWORKS.ZODIAC_SAFE ? 'active' : ''}"
          onclick={() => handleFrameworkChange(DAO_FRAMEWORKS.ZODIAC_SAFE)}
        >
          Zodiac / Gnosis Safe Module
        </button>
        <button
          type="button"
          class="framework-btn {selectedFramework === DAO_FRAMEWORKS.ARAGON_OSX ? 'active' : ''}"
          onclick={() => handleFrameworkChange(DAO_FRAMEWORKS.ARAGON_OSX)}
        >
          Aragon OSx Plugin
        </button>
        <button
          type="button"
          class="framework-btn {selectedFramework === DAO_FRAMEWORKS.ENDAOSMENT ? 'active' : ''}"
          onclick={() => handleFrameworkChange(DAO_FRAMEWORKS.ENDAOSMENT)}
        >
          EnDAOsment (Stage 1 Approval + Stage 2 Quadratic)
        </button>
      </div>
    </div>

    {#if selectedFramework !== DAO_FRAMEWORKS.STANDALONE}
      <div class="parent-binding-row">
        <span class="selector-label">Parent DAO / Timelock Address:</span>
        <div class="binding-input-group">
          <input
            type="text"
            class="input-mono"
            placeholder="0x... (Parent DAO or Gnosis Safe Avatar)"
            bind:value={parentDaoAddressInput}
          />
          <button type="button" class="btn-bind" onclick={handleUpdateParentAddress}>
            Bind Framework
          </button>
        </div>
      </div>
    {/if}
  </section>

  <!-- Notification Banner -->
  {#if feedbackMessage}
    <div class="banner-success">
      <span class="material-symbols-outlined">check_circle</span>
      <span>{feedbackMessage}</span>
    </div>
  {/if}

  {#if feedbackError}
    <div class="banner-error">
      <span class="material-symbols-outlined">error</span>
      <span>{feedbackError}</span>
    </div>
  {/if}

  <!-- Active ZK Ballot Receipt -->
  {#if activeZkReceipt}
    <div class="zk-receipt-card">
      <div class="zk-header">
        <div class="zk-title-group">
          <span class="material-symbols-outlined text-purple">lock</span>
          <h3>Cryptographic Zero-Knowledge Ballot Receipt</h3>
        </div>
        <span class="zk-time">{activeZkReceipt.timestamp}</span>
      </div>
      <div class="zk-body">
        <div class="zk-row">
          <span class="zk-label">Nullifier Hash (Anti-Double-Vote):</span>
          <span class="zk-hash">{activeZkReceipt.nullifierHash}</span>
        </div>
        <div class="zk-row">
          <span class="zk-label">Semaphore Merkle Root:</span>
          <span class="zk-hash">{activeZkReceipt.merkleRoot}</span>
        </div>
        <div class="zk-row">
          <span class="zk-label">Ballot Decision & Weight:</span>
          <span class="zk-verdict {activeZkReceipt.support ? 'for' : 'against'}">
            {activeZkReceipt.support ? 'FOR' : 'AGAINST'} (+{activeZkReceipt.votingWeight} weight)
          </span>
        </div>
      </div>
      <p class="zk-footer-note">
        This ballot was verified via client-side SnarkJS / Semaphore protocol. Your vote has been etched into the
        Epistemic Governor contract while guaranteeing mathematical zero-linkability to your identity.
      </p>
    </div>
  {/if}

  <!-- Governance Header Actions -->
  <div class="proposals-toolbar">
    <div class="toolbar-left">
      <h3>Active Epistemic Proposals ({proposalList.length})</h3>
      <span class="sub-text">Protocol parameters, public goods allocations & AI guardrail upgrades</span>
    </div>
    <button class="btn-primary" onclick={() => (showCreateModal = true)}>
      <span class="material-symbols-outlined">add_circle</span>
      <span>New Proposal</span>
    </button>
  </div>

  <!-- Proposal Cards Grid -->
  <div class="proposals-grid">
    {#each proposalList as prop}
      <div class="proposal-card">
        <div class="prop-header">
          <div class="prop-status-row">
            <span class="status-badge {prop.status.toLowerCase()}">{prop.status}</span>
            <span class="min-tier-badge">Min Tier: {prop.minTierRequired || 'ALL'}</span>
          </div>
          <h4 class="prop-title">{prop.title}</h4>
          <div class="prop-cid-link">
            <span class="material-symbols-outlined file-icon">description</span>
            <span class="cid-mono">{prop.description}</span>
          </div>
        </div>

        <!-- Quorum & Tally Progress Bar -->
        <div class="tally-box">
          <div class="tally-stats">
            <span class="tally-for">FOR: <strong>{prop.votesFor}</strong></span>
            <span class="tally-against">AGAINST: <strong>{prop.votesAgainst}</strong></span>
            <span class="tally-quorum">Quorum: {prop.votesFor + prop.votesAgainst}/{prop.quorumRequired}</span>
          </div>
          <div class="progress-track">
            <div
              class="progress-bar for"
              style="width: {prop.votesFor + prop.votesAgainst > 0 ? (prop.votesFor / (prop.votesFor + prop.votesAgainst)) * 100 : 50}%"
            ></div>
          </div>
        </div>

        <!-- ZK Voting Actions -->
        <div class="prop-actions">
          <button
            class="btn-vote for"
            onclick={() => handleAnonymousZkVote(prop.proposalId, true)}
          >
            <span class="material-symbols-outlined">thumb_up</span>
            <span>Vote FOR (+{memberRecord?.votingPower || 10})</span>
          </button>
          <button
            class="btn-vote against"
            onclick={() => handleAnonymousZkVote(prop.proposalId, false)}
          >
            <span class="material-symbols-outlined">thumb_down</span>
            <span>Vote AGAINST (+{memberRecord?.votingPower || 10})</span>
          </button>
        </div>
      </div>
    {/each}
  </div>

  <!-- Create Proposal Modal -->
  {#if showCreateModal}
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Create Epistemic DAO Proposal</h3>
          <button class="close-btn" onclick={() => (showCreateModal = false)}>✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="prop-title">Proposal Title</label>
            <input
              id="prop-title"
              type="text"
              placeholder="e.g. EIP-14: Adjust Losing Pool Slashing to 18% Whistleblower Bounty"
              bind:value={newPropTitle}
            />
          </div>

          <div class="form-group">
            <label for="prop-cid">Specification IPFS CID</label>
            <input
              id="prop-cid"
              type="text"
              placeholder="ipfs://bafkreiexampleproposalspecificationcidhash..."
              bind:value={newPropCid}
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="prop-tier">Minimum Voter Tier</label>
              <select id="prop-tier" bind:value={newPropMinTier}>
                <option value="NOVICE">Novice (Tier 1)</option>
                <option value="CONTRIBUTOR">Contributor (Tier 2)</option>
                <option value="ARBITER">Truth Arbiter (Tier 3)</option>
                <option value="SAGE">Sage Elder (Tier 4)</option>
              </select>
            </div>

            <div class="form-group">
              <label for="prop-quorum">Quorum Threshold</label>
              <input
                id="prop-quorum"
                type="number"
                bind:value={newPropQuorum}
              />
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" onclick={() => (showCreateModal = false)}>Cancel</button>
          <button class="btn-primary" onclick={handleCreateProposal}>Submit Proposal</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .governance-container {
    padding: 24px;
    max-width: 1280px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .passport-banner {
    background: linear-gradient(135deg, rgba(20, 24, 39, 0.95), rgba(15, 18, 30, 0.98));
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 32px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .passport-left {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    flex: 1;
  }

  .tier-shield {
    width: 60px;
    height: 60px;
    background: rgba(147, 51, 234, 0.15);
    border: 1px solid rgba(147, 51, 234, 0.4);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .shield-icon {
    font-size: 32px;
    color: #c084fc;
  }

  .passport-meta h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
  }

  .passport-header-line {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .tier-pill {
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tier-pill.sage {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.4);
  }

  .passport-desc {
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.5;
    margin: 0 0 12px 0;
    max-width: 580px;
  }

  .merkle-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #cbd5e1;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    background: #10b981;
    border-radius: 50%;
    box-shadow: 0 0 8px #10b981;
  }

  .passport-metrics {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    min-width: 380px;
  }

  .metric-box {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric-box.eq-highlight {
    background: rgba(147, 51, 234, 0.08);
    border-color: rgba(147, 51, 234, 0.25);
  }

  .m-title {
    font-size: 11px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .m-value {
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
  }

  .m-unit {
    font-size: 12px;
    color: #64748b;
    font-weight: normal;
  }

  .text-gold { color: #f59e0b; }
  .text-cyan { color: #06b6d4; }
  .text-emerald { color: #10b981; }
  .text-purple { color: #c084fc; }

  /* Banners */
  .banner-success, .banner-error {
    padding: 14px 18px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
  }

  .banner-success {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
  }

  .banner-error {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  /* ZK Receipt Card */
  .zk-receipt-card {
    background: rgba(147, 51, 234, 0.06);
    border: 1px solid rgba(147, 51, 234, 0.3);
    border-radius: 12px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .zk-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .zk-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zk-title-group h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .zk-time {
    font-size: 11px;
    color: #94a3b8;
  }

  .zk-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-family: monospace;
    font-size: 12px;
  }

  .zk-row {
    display: flex;
    gap: 10px;
  }

  .zk-label {
    color: #94a3b8;
    min-width: 200px;
  }

  .zk-hash {
    color: #cbd5e1;
    word-break: break-all;
  }

  .zk-verdict.for { color: #34d399; font-weight: 700; }
  .zk-verdict.against { color: #f87171; font-weight: 700; }

  .zk-footer-note {
    margin: 0;
    font-size: 11px;
    color: #94a3b8;
    font-style: italic;
  }

  /* Proposals Toolbar */
  .proposals-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .toolbar-left h3 {
    margin: 0 0 4px 0;
    font-size: 18px;
    color: #f8fafc;
  }

  .sub-text {
    font-size: 13px;
    color: #94a3b8;
  }

  /* Proposal Grid & Cards */
  .proposals-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
    gap: 20px;
  }

  .proposal-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .prop-status-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .status-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .status-badge.active {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .min-tier-badge {
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    color: #94a3b8;
  }

  .prop-title {
    margin: 0;
    font-size: 16px;
    color: #f8fafc;
    line-height: 1.4;
  }

  .prop-cid-link {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    color: #94a3b8;
    font-size: 11px;
    font-family: monospace;
  }

  .file-icon {
    font-size: 16px;
  }

  .tally-box {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tally-stats {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .tally-for { color: #34d399; }
  .tally-against { color: #f87171; }
  .tally-quorum { color: #94a3b8; }

  .progress-track {
    height: 6px;
    background: rgba(239, 68, 68, 0.4);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar.for {
    height: 100%;
    background: #10b981;
  }

  .prop-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .btn-vote {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-vote.for {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .btn-vote.for:hover {
    background: rgba(16, 185, 129, 0.25);
  }

  .btn-vote.against {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .btn-vote.against:hover {
    background: rgba(239, 68, 68, 0.25);
  }

  .btn-primary {
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary:hover {
    background: #4f46e5;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
  }

  .modal-card {
    background: #1e2235;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    width: 520px;
    max-width: 90vw;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #f8fafc;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 18px;
    cursor: pointer;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }

  .form-group label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
  }

  .form-group input, .form-group select {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px 12px;
    color: #f8fafc;
    font-size: 13px;
  }

  .form-row {
    display: flex;
    gap: 16px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
  }

  .framework-banner {
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);
    border: 1px solid rgba(168, 85, 247, 0.25);
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .framework-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .framework-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .framework-title-group h3 {
    margin: 0;
    font-size: 15px;
    color: #f8fafc;
    font-weight: 600;
  }

  .framework-sub {
    margin: 2px 0 0 0;
    font-size: 12px;
    color: #94a3b8;
  }

  .proxy-badge-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .proxy-pill {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 9999px;
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.3);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .proxy-pill.mono {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.3);
    color: #cbd5e1;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .status-dot.green {
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
  }

  .framework-selector-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .selector-label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
  }

  .framework-pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .framework-btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .framework-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f1f5f9;
  }

  .framework-btn.active {
    background: rgba(168, 85, 247, 0.2);
    border-color: #a855f7;
    color: #f3e8ff;
    box-shadow: 0 0 10px rgba(168, 85, 247, 0.2);
  }

  .parent-binding-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .binding-input-group {
    display: flex;
    gap: 8px;
    flex: 1;
    max-width: 500px;
  }

  .input-mono {
    font-family: monospace;
    font-size: 12px;
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #f8fafc;
    flex: 1;
  }

  .btn-bind {
    padding: 6px 14px;
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-bind:hover {
    background: #6d28d9;
  }
</style>
