<script>
  import { CourtroomSettlementService, SETTLEMENT_STATUS } from '../settlement/courtroomSettlement.js';

  let {
    userDid = 'did:pkh:eip155:1:0x71C8360f3a1591E108f20387b925b39F11FaB19',
    settlementService = new CourtroomSettlementService()
  } = $props();

  // Seed sample cases
  let seedCases = [
    {
      caseId: 'case_fusion_q_breakeven',
      title: 'Fusion Q-Factor Breakeven Inquiry',
      claimText: 'Net energy gain Q > 1.0 achieved in magnetic confinement fusion in Q1 2024.',
      creatorDid: 'did:plc:bob_physics',
      deposit: 300,
      daysIdle: 15 // Trigger stale/cold
    },
    {
      caseId: 'case_co2_2024',
      title: 'Atmospheric CO2 2024 Inquiry',
      claimText: 'Global atmospheric CO2 concentrations reached 420 ppm in 2024.',
      creatorDid: 'did:plc:alice_climate',
      deposit: 500,
      daysIdle: 3 // Active
    }
  ];

  $effect(() => {
    if (settlementService.cases.size === 0) {
      for (const sc of seedCases) {
        const c = settlementService.docketCase(sc);
        if (sc.daysIdle >= 14) {
          // Manually simulate time lapse for testing
          c.lastActivity = Date.now() - (sc.daysIdle * 24 * 60 * 60 * 1000);
          settlementService.checkStaleStatus(sc.caseId);
        }
      }
    }
  });

  let selectedCaseId = $state('case_fusion_q_breakeven');
  let challengeBondAmount = $state(600);
  let challengeEvidence = $state('');
  let feedbackMessage = $state('');
  let refreshTrigger = $state(0);

  let activeCase = $derived.by(() => {
    void refreshTrigger;
    return settlementService.cases.get(selectedCaseId);
  });

  function handleCheckColdStatus() {
    feedbackMessage = '';
    try {
      const res = settlementService.checkStaleStatus(selectedCaseId);
      refreshTrigger += 1;
      if (res.status === SETTLEMENT_STATUS.COLD_CASE) {
        feedbackMessage = `Case is Cold! Refunded $${res.refundAmount} (94%) to creator, retained $${res.platformFee} (6%) protocol fee.`;
      } else {
        feedbackMessage = `Case is still active (${Math.round((Date.now() - activeCase.lastActivity)/(1000*3600*24))} days idle). 14-day threshold not reached.`;
      }
    } catch (err) {
      feedbackMessage = `Error: ${err.message}`;
    }
  }

  function handleFileChallengeBond() {
    feedbackMessage = '';
    if (!challengeEvidence.trim()) {
      feedbackMessage = 'Fresh material evidence citation is required to file a challenge bond.';
      return;
    }

    try {
      const res = settlementService.fileChallengeBond(
        selectedCaseId,
        userDid,
        Number(challengeBondAmount),
        challengeEvidence
      );
      refreshTrigger += 1;
      feedbackMessage = `Challenge Bond Accepted! Staked $${res.bondAmount} at ${res.bondEscrowRatio}x original deposit. Case reopened for retrial.`;
      challengeEvidence = '';
    } catch (err) {
      feedbackMessage = `Error: ${err.message}`;
    }
  }
</script>

<div class="escrow-container">
  <div class="escrow-header">
    <div class="header-titles">
      <h2>Courtroom Settlement & Escrow Vault</h2>
      <p class="subtitle">14-Day Cold Case Inactivity Protection & Retrial Challenge Bonds</p>
    </div>
  </div>

  <div class="escrow-grid">
    <!-- Left Column: Case Selector -->
    <div class="case-selector-pane">
      <h3>Monitored Dockets</h3>
      <div class="case-list">
        {#each Array.from(settlementService.cases.values()) as c}
          <button
            class="case-item-btn {selectedCaseId === c.caseId ? 'selected' : ''}"
            onclick={() => selectedCaseId = c.caseId}
          >
            <div class="case-item-top">
              <span class="status-badge {c.status.toLowerCase()}">{c.status}</span>
              <span class="deposit-val">${c.deposit} Escrow</span>
            </div>
            <p class="case-title">{c.title}</p>
          </button>
        {/each}
      </div>
    </div>

    <!-- Right Column: Settlement & Challenge Controls -->
    {#if activeCase}
      <div class="case-details-pane">
        <div class="case-card">
          <div class="card-meta">
            <span>CASE ID: {activeCase.caseId}</span>
            <span>Status: <strong class="{activeCase.status.toLowerCase()}">{activeCase.status}</strong></span>
          </div>

          <h3 class="claim-heading">{activeCase.claimText}</h3>

          <!-- Section 1: 14-Day Cold Case Refund Tracker -->
          <div class="sub-card cold-case-card">
            <div class="sub-card-header">
              <span class="material-symbols-outlined icon-cold">ac_unit</span>
              <h4>14-Day Inactivity Cold Case Mechanism</h4>
            </div>
            <p class="sub-description">
              Cases without new evidence or deliberations for 14 consecutive days automatically refund
              <strong>94% of deposited wagers</strong> back to participants, retaining <strong>6% platform fee</strong>.
            </p>

            <div class="escrow-breakdown">
              <div class="breakdown-stat">
                <span class="stat-label">Initial Escrow Deposit</span>
                <span class="stat-val">${activeCase.deposit} USDC</span>
              </div>
              <div class="breakdown-stat">
                <span class="stat-label">94% Refund Allocation</span>
                <span class="stat-val text-green">${(activeCase.deposit * 0.94).toFixed(2)} USDC</span>
              </div>
              <div class="breakdown-stat">
                <span class="stat-label">6% Protocol Maintenance Fee</span>
                <span class="stat-val text-gold">${(activeCase.deposit * 0.06).toFixed(2)} USDC</span>
              </div>
            </div>

            <button class="btn-secondary" onclick={handleCheckColdStatus}>
              <span class="material-symbols-outlined">hourglass_bottom</span>
              Evaluate Inactivity & Trigger Cold Refund
            </button>
          </div>

          <!-- Section 2: Challenge Bond & Retrial Console -->
          <div class="sub-card challenge-card">
            <div class="sub-card-header">
              <span class="material-symbols-outlined icon-challenge">shield</span>
              <h4>Anti-Spam Challenge Bond (Retrial & Appeals)</h4>
            </div>
            <p class="sub-description">
              Reopening a cold or settled case requires an escalated Challenge Bond (2x initial deposit)
              plus fresh material evidence. If the verdict is overturned, challenger receives a <strong>50% bounty</strong>.
            </p>

            <div class="challenge-inputs">
              <div class="input-group">
                <label for="bond-amt">Required Challenge Bond (2x minimum):</label>
                <input
                  id="bond-amt"
                  type="number"
                  min={activeCase.deposit * 2}
                  bind:value={challengeBondAmount}
                />
              </div>

              <div class="input-group">
                <label for="evidence-txt">Fresh Material Evidence Citation URL:</label>
                <input
                  id="evidence-txt"
                  type="text"
                  placeholder="https://doi.org/10.1038/... or IPFS CID"
                  bind:value={challengeEvidence}
                />
              </div>

              <button class="btn-challenge" onclick={handleFileChallengeBond}>
                <span class="material-symbols-outlined">gavel</span>
                Stake ${challengeBondAmount} Challenge Bond & Reopen
              </button>
            </div>
          </div>

          {#if feedbackMessage}
            <div class="feedback-box {feedbackMessage.includes('Error') ? 'error' : 'info'}">
              {feedbackMessage}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .escrow-container {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 20px;
  }

  .escrow-header {
    margin-bottom: 24px;
  }

  .header-titles h2 {
    font-size: 1.5rem;
    font-weight: 800;
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
  }

  .escrow-grid {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
  }

  @media (max-width: 860px) {
    .escrow-grid {
      grid-template-columns: 1fr;
    }
  }

  .case-selector-pane h3 {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .case-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .case-item-btn {
    text-align: left;
    background: var(--bg-surface, #0f172a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    padding: 14px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .case-item-btn:hover {
    border-color: rgba(59, 130, 246, 0.4);
  }

  .case-item-btn.selected {
    border-color: var(--accent-blue, #3b82f6);
    background: rgba(59, 130, 246, 0.05);
  }

  .case-item-top {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .status-badge {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .status-badge.open {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .status-badge.cold_case {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
  }

  .status-badge.appealed {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .deposit-val {
    font-size: 0.76rem;
    font-weight: 700;
    color: #3b82f6;
  }

  .case-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main, #f8fafc);
  }

  .case-card {
    background: var(--bg-surface, #0f172a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    padding: 24px;
  }

  .card-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 12px;
  }

  .claim-heading {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-main, #f8fafc);
    margin-bottom: 24px;
    line-height: 1.4;
  }

  .sub-card {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    padding: 18px;
    margin-bottom: 20px;
  }

  .sub-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .sub-card-header h4 {
    font-size: 0.95rem;
    font-weight: 700;
  }

  .icon-cold { color: #38bdf8; }
  .icon-challenge { color: #f59e0b; }

  .sub-description {
    font-size: 0.82rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.5;
    margin-bottom: 16px;
  }

  .escrow-breakdown {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    background: rgba(0, 0, 0, 0.2);
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  @media (max-width: 640px) {
    .escrow-breakdown {
      grid-template-columns: 1fr;
    }
  }

  .breakdown-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label {
    font-size: 0.68rem;
    color: var(--text-muted, #94a3b8);
  }

  .stat-val {
    font-size: 0.95rem;
    font-weight: 700;
  }

  .text-green { color: #10b981; }
  .text-gold { color: #f59e0b; }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: #f8fafc;
    font-weight: 600;
    font-size: 0.82rem;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .challenge-inputs {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .input-group label {
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
  }

  .input-group input {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: #ffffff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .btn-challenge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: #ffffff;
    font-weight: 700;
    font-size: 0.85rem;
    border: none;
    padding: 10px 18px;
    border-radius: 6px;
    cursor: pointer;
    transition: filter 0.2s ease;
  }

  .btn-challenge:hover {
    filter: brightness(1.1);
  }

  .feedback-box {
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 0.85rem;
  }

  .feedback-box.info {
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid #3b82f6;
    color: #60a5fa;
  }

  .feedback-box.error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    color: #ef4444;
  }
</style>
