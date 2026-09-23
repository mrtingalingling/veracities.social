<script>
  import { ValidationMarket, OUTCOMES } from '../market/validationMarket.js';

  let {
    userDid = 'did:pkh:eip155:1:0x71C8360f3a1591E108f20387b925b39F11FaB19',
    marketInstance = new ValidationMarket()
  } = $props();

  // Initialize seed markets if empty
  let seedMarkets = [
    {
      claimId: 'case_co2_2024',
      claimText: 'Global atmospheric CO2 concentrations reached 420 ppm in 2024.',
      creatorDid: 'did:plc:alice_climate',
      initialBounty: 500
    },
    {
      claimId: 'case_fusion_q_breakeven',
      claimText: 'Net energy gain Q > 1.0 achieved in magnetic confinement fusion in Q1 2024.',
      creatorDid: 'did:plc:bob_physics',
      initialBounty: 1200
    },
    {
      claimId: 'case_mars_subsurface_ice',
      claimText: 'Perseverance rover confirmed liquid subsurface brines under Jezero Crater.',
      creatorDid: 'did:plc:carol_space',
      initialBounty: 800
    }
  ];

  // Seed market data
  $effect(() => {
    if (marketInstance.markets.size === 0) {
      for (const m of seedMarkets) {
        const created = marketInstance.createMarket(m);
        // Pre-stake initial distribution
        marketInstance.placeStake({ marketId: created.marketId, stakerDid: 'did:pkh:0xWhale1', outcome: OUTCOMES.VERIFIED, amount: 350 });
        marketInstance.placeStake({ marketId: created.marketId, stakerDid: 'did:pkh:0xSkeptic', outcome: OUTCOMES.MISINFORMED, amount: 150 });
        marketInstance.placeStake({ marketId: created.marketId, stakerDid: 'did:pkh:0xJurorX', outcome: OUTCOMES.DISPUTED, amount: 80 });
      }
    }
  });

  let selectedMarketId = $state('market_case_co2_2024');
  let stakeOutcome = $state(OUTCOMES.VERIFIED);
  let stakeAmount = $state(100);
  let stakeNotification = $state('');
  let updateTrigger = $state(0);

  let activeMarket = $derived.by(() => {
    // depend on updateTrigger for reactive re-render
    void updateTrigger;
    return marketInstance.markets.get(selectedMarketId);
  });

  let activeOdds = $derived.by(() => {
    void updateTrigger;
    if (!selectedMarketId || !marketInstance.markets.has(selectedMarketId)) return {};
    return marketInstance.calculateOdds(selectedMarketId);
  });

  let userStakes = $derived.by(() => {
    void updateTrigger;
    if (!selectedMarketId) return [];
    const stakes = marketInstance.stakes.get(selectedMarketId) || [];
    return stakes.filter(s => s.stakerDid === userDid);
  });

  function handleStakeSubmit() {
    stakeNotification = '';
    if (!activeMarket) return;
    if (stakeAmount <= 0) {
      stakeNotification = 'Stake amount must be greater than zero.';
      return;
    }

    try {
      const receipt = marketInstance.placeStake({
        marketId: selectedMarketId,
        stakerDid: userDid,
        outcome: stakeOutcome,
        amount: Number(stakeAmount)
      });
      updateTrigger += 1;
      stakeNotification = `Successfully staked $${receipt.amount} on ${receipt.outcome}!`;
      setTimeout(() => { stakeNotification = ''; }, 4000);
    } catch (err) {
      stakeNotification = `Error: ${err.message}`;
    }
  }

  function getOutcomeColor(outcome) {
    switch (outcome) {
      case OUTCOMES.VERIFIED: return '#10b981';
      case OUTCOMES.MISINFORMED: return '#ef4444';
      case OUTCOMES.DISPUTED: return '#8b5cf6';
      case OUTCOMES.NEED_CONTEXT: return '#f59e0b';
      default: return '#94a3b8';
    }
  }
</script>

<div class="market-container">
  <div class="market-header">
    <div class="header-titles">
      <h2>Validation Prediction Markets</h2>
      <p class="subtitle">4-Outcome Epistemic Betting Pools Settled via Courtroom Attestations</p>
    </div>
    <div class="total-pools-badge">
      <span class="material-symbols-outlined">payments</span>
      <span>Total Volume: <strong>$3,280 USDC</strong></span>
    </div>
  </div>

  <div class="market-grid">
    <!-- Left Column: Active Market List -->
    <div class="market-list-pane">
      <h3>Active Courtroom Cases</h3>
      <div class="case-cards">
        {#each Array.from(marketInstance.markets.values()) as m}
          <button
            class="case-select-btn {selectedMarketId === m.marketId ? 'selected' : ''}"
            onclick={() => selectedMarketId = m.marketId}
          >
            <div class="case-meta">
              <span class="status-pill {m.status.toLowerCase()}">{m.status}</span>
              <span class="pool-vol">${m.totalPool} Pool</span>
            </div>
            <p class="case-claim-snippet">{m.claimText}</p>
          </button>
        {/each}
      </div>
    </div>

    <!-- Right Column: Market Details & Staking Form -->
    {#if activeMarket}
      <div class="market-detail-pane">
        <div class="market-detail-card">
          <div class="detail-header">
            <span class="market-tag">MARKET ID: {activeMarket.marketId}</span>
            <span class="creator-tag">Originator: {activeMarket.creatorDid.slice(0, 16)}...</span>
          </div>

          <h3 class="detail-claim">{activeMarket.claimText}</h3>

          <!-- Dynamic 4-Outcome Odds Grid -->
          <div class="odds-section">
            <h4>Live Epistemic Odds</h4>
            <div class="odds-grid">
              {#each Object.entries(OUTCOMES) as [key, outcome]}
                {@const pool = activeMarket.outcomePools[outcome] || 0}
                {@const oddsVal = activeOdds[outcome] || 1.0}
                {@const color = getOutcomeColor(outcome)}
                <button
                  type="button"
                  class="odds-card {stakeOutcome === outcome ? 'active-selection' : ''}"
                  style="--accent-col: {color}"
                  onclick={() => stakeOutcome = outcome}
                >
                  <div class="odds-top">
                    <span class="outcome-label">{outcome}</span>
                    <span class="odds-multiple">{oddsVal}x</span>
                  </div>
                  <div class="odds-pool-bar">
                    <div
                      class="odds-fill"
                      style="width: {activeMarket.totalPool > 0 ? (pool / activeMarket.totalPool) * 100 : 0}%; background-color: {color};"
                    ></div>
                  </div>
                  <div class="odds-bottom">
                    <span>Pool: ${pool}</span>
                    <span>{activeMarket.totalPool > 0 ? Math.round((pool / activeMarket.totalPool) * 100) : 0}%</span>
                  </div>
                </button>
              {/each}
            </div>
          </div>

          <!-- Staking Action Box -->
          <div class="staking-box">
            <h4>Place Validation Wager</h4>
            <div class="stake-inputs">
              <div class="input-group">
                <label for="outcome-select">Selected Outcome:</label>
                <select id="outcome-select" bind:value={stakeOutcome}>
                  {#each Object.keys(OUTCOMES) as outcome}
                    <option value={outcome}>{outcome} ({activeOdds[outcome] || 1.0}x)</option>
                  {/each}
                </select>
              </div>

              <div class="input-group">
                <label for="stake-amt">Stake Amount (USDC / Credits):</label>
                <input
                  id="stake-amt"
                  type="number"
                  min="5"
                  step="10"
                  bind:value={stakeAmount}
                />
              </div>

              <button class="btn-stake" onclick={handleStakeSubmit}>
                <span class="material-symbols-outlined">monetization_on</span>
                Stake ${stakeAmount} on {stakeOutcome}
              </button>
            </div>

            {#if stakeNotification}
              <div class="notification-banner {stakeNotification.includes('Error') ? 'error' : 'success'}">
                {stakeNotification}
              </div>
            {/if}
          </div>

          <!-- User's Active Position in this Market -->
          <div class="user-position-section">
            <h4>Your Active Stakes in this Case</h4>
            {#if userStakes.length === 0}
              <p class="no-stakes">No active wagers placed from your connected wallet.</p>
            {:else}
              <div class="stakes-table">
                {#each userStakes as s}
                  <div class="stake-row">
                    <span class="badge-outcome" style="background-color: {getOutcomeColor(s.outcome)}">{s.outcome}</span>
                    <span class="stake-val">${s.amount} USDC</span>
                    <span class="stake-time">{new Date(s.timestamp).toLocaleTimeString()}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .market-container {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 20px;
  }

  .market-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
  }

  .header-titles h2 {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--text-main, #f8fafc);
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
  }

  .total-pools-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 8px 16px;
    border-radius: 12px;
    color: var(--accent-gold, #f59e0b);
    font-size: 0.9rem;
  }

  .market-grid {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
  }

  @media (max-width: 860px) {
    .market-grid {
      grid-template-columns: 1fr;
    }
  }

  .market-list-pane h3, .market-detail-pane h4 {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }

  .case-cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .case-select-btn {
    text-align: left;
    background: var(--bg-surface, #0f172a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    padding: 14px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .case-select-btn:hover {
    border-color: rgba(245, 158, 11, 0.4);
    transform: translateY(-1px);
  }

  .case-select-btn.selected {
    border-color: var(--accent-gold, #f59e0b);
    background: rgba(245, 158, 11, 0.05);
  }

  .case-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .status-pill {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .status-pill.open {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .pool-vol {
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--accent-gold, #f59e0b);
  }

  .case-claim-snippet {
    font-size: 0.82rem;
    color: var(--text-main, #f8fafc);
    line-height: 1.4;
  }

  .market-detail-card {
    background: var(--bg-surface, #0f172a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    padding: 24px;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 12px;
  }

  .detail-claim {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-main, #f8fafc);
    margin-bottom: 24px;
    line-height: 1.4;
  }

  .odds-section {
    margin-bottom: 24px;
  }

  .odds-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  @media (max-width: 600px) {
    .odds-grid {
      grid-template-columns: 1fr;
    }
  }

  .odds-card {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    padding: 14px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .odds-card:hover, .odds-card.active-selection {
    border-color: var(--accent-col);
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.15);
  }

  .odds-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .outcome-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--accent-col);
  }

  .odds-multiple {
    font-size: 1.1rem;
    font-weight: 800;
    color: #ffffff;
  }

  .odds-pool-bar {
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .odds-fill {
    height: 100%;
    transition: width 0.3s ease;
  }

  .odds-bottom {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
  }

  .staking-box {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    padding: 18px;
    border-radius: 10px;
    margin-bottom: 24px;
  }

  .stake-inputs {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 140px;
  }

  .input-group label {
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
  }

  .input-group select, .input-group input {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: #ffffff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .btn-stake {
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #000000;
    font-weight: 700;
    font-size: 0.85rem;
    border: none;
    padding: 9px 18px;
    border-radius: 6px;
    cursor: pointer;
    transition: filter 0.2s ease;
    height: 38px;
  }

  .btn-stake:hover {
    filter: brightness(1.1);
  }

  .notification-banner {
    margin-top: 12px;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 0.82rem;
  }

  .notification-banner.success {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid #10b981;
    color: #10b981;
  }

  .notification-banner.error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    color: #ef4444;
  }

  .user-position-section {
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    padding-top: 16px;
  }

  .no-stakes {
    font-size: 0.78rem;
    color: var(--text-muted, #94a3b8);
    font-style: italic;
  }

  .stakes-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stake-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.03);
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .badge-outcome {
    font-size: 0.7rem;
    font-weight: 700;
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .stake-val {
    font-weight: 700;
    color: #f8fafc;
  }

  .stake-time {
    color: var(--text-muted, #94a3b8);
    font-size: 0.72rem;
  }
</style>
