<script>
  import { ValidationMarket, OUTCOMES, ROUNDS, POKER_ACTIONS, ROUND_SEQUENCE } from '../market/validationMarket.js';

  let {
    userDid = 'did:pkh:eip155:1:0x71C8360f3a1591E108f20387b925b39F11FaB19',
    marketInstance = new ValidationMarket()
  } = $props();

  const VIEW_MODES = {
    MARKETS: 'MARKETS',
    PARLEYS: 'PARLEYS',
    HEDGES: 'HEDGES'
  };

  let activeViewMode = $state(VIEW_MODES.MARKETS);

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
  let isFoldModalOpen = $state(false);

  // Parley builder state
  let parleySelections = $state({}); // { [marketId]: outcome }
  let parleyStakeAmount = $state(50);
  let parleyNotification = $state('');

  // Layer 2: Derivative Hedge Options state (PRD §5.3)
  let hedgeMarketId = $state('market_case_co2_2024');
  let hedgeType = $state('PUT'); // 'PUT' | 'CALL'
  let hedgeOutcome = $state(OUTCOMES.VERIFIED);
  let hedgeNotional = $state(100);
  let hedgeNotification = $state('');

  let hedgeQuote = $derived.by(() => {
    void updateTrigger;
    if (!hedgeMarketId || !marketInstance.markets.has(hedgeMarketId)) return { premium: 0, strikeOdds: 1.0, potentialPayout: 0 };
    const oddsMap = marketInstance.calculateOdds(hedgeMarketId);
    const odds = oddsMap[hedgeOutcome] || 1.5;
    const premium = hedgeType === 'PUT'
      ? Math.max(1, Math.round((hedgeNotional / Math.max(1.2, odds)) * 0.15 * 100) / 100)
      : Math.max(1, Math.round((hedgeNotional * 0.10) * 100) / 100);
    const potentialPayout = hedgeType === 'PUT' ? hedgeNotional : Math.round(hedgeNotional * odds * 100) / 100;
    return { premium, strikeOdds: odds, potentialPayout };
  });

  let userHedges = $derived.by(() => {
    void updateTrigger;
    return marketInstance.getHedgeOptionsForUser(userDid);
  });

  function handleBuyHedge() {
    hedgeNotification = '';
    try {
      const option = marketInstance.purchaseHedgeOption({
        stakerDid: userDid,
        marketId: hedgeMarketId,
        type: hedgeType,
        targetOutcome: hedgeOutcome,
        notionalAmount: Number(hedgeNotional),
        strikeOdds: hedgeQuote.strikeOdds
      });
      updateTrigger += 1;
      hedgeNotification = `Hedge ${option.type} option purchased for ${option.premium} USDC! Notional: ${option.notionalAmount} USDC.`;
    } catch (err) {
      hedgeNotification = `Error: ${err.message}`;
    }
  }

  let activeMarket = $derived.by(() => {
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

  let userTotalStakeInActive = $derived.by(() => {
    return userStakes.reduce((acc, s) => acc + s.amount, 0);
  });

  let isUserFolded = $derived.by(() => {
    void updateTrigger;
    if (!activeMarket) return false;
    return activeMarket.foldedStakers?.has(userDid) || userStakes.some(s => s.folded);
  });

  // Parley derived state
  let selectedParleyLegs = $derived.by(() => {
    void updateTrigger;
    const legs = [];
    for (const [mId, outcome] of Object.entries(parleySelections)) {
      if (outcome && marketInstance.markets.has(mId)) {
        const m = marketInstance.markets.get(mId);
        const oddsMap = marketInstance.calculateOdds(mId);
        const odds = oddsMap[outcome] || 1.0;
        legs.push({ marketId: mId, claimText: m.claimText, outcome, odds });
      }
    }
    return legs;
  });

  let parleyCombinedOdds = $derived.by(() => {
    if (selectedParleyLegs.length < 2) return 1.0;
    return Math.round(selectedParleyLegs.reduce((acc, l) => acc * l.odds, 1.0) * 100) / 100;
  });

  let parleyPotentialPayout = $derived.by(() => {
    return Math.round(parleyStakeAmount * parleyCombinedOdds * 100) / 100;
  });

  let userParleys = $derived.by(() => {
    void updateTrigger;
    return marketInstance.getParleysForUser(userDid);
  });

  function handlePokerAction(action) {
    stakeNotification = '';
    if (!activeMarket) return;

    if (action === POKER_ACTIONS.FOLD) {
      if (userStakes.length === 0) {
        stakeNotification = 'You have no active wagers in this market to fold.';
        return;
      }
      isFoldModalOpen = true;
      return;
    }

    try {
      const receipt = marketInstance.executePokerAction({
        marketId: selectedMarketId,
        stakerDid: userDid,
        action,
        outcome: stakeOutcome,
        amount: action === POKER_ACTIONS.CHECK ? 0 : Number(stakeAmount)
      });
      updateTrigger += 1;
      if (action === POKER_ACTIONS.CHECK) {
        stakeNotification = `Checked in ${activeMarket.currentRound}. No funds added.`;
      } else {
        stakeNotification = `Successfully placed ${action} of $${receipt.amount} on ${receipt.outcome}!`;
      }
      setTimeout(() => { stakeNotification = ''; }, 4500);
    } catch (err) {
      stakeNotification = `Error: ${err.message}`;
    }
  }

  function confirmFold() {
    isFoldModalOpen = false;
    try {
      const receipt = marketInstance.executePokerAction({
        marketId: selectedMarketId,
        stakerDid: userDid,
        action: POKER_ACTIONS.FOLD
      });
      updateTrigger += 1;
      stakeNotification = `Position Folded: Surrendered $${receipt.forfeitedAmount} to evidence bounty pool; remaining capital preserved against further loss.`;
      setTimeout(() => { stakeNotification = ''; }, 6000);
    } catch (err) {
      stakeNotification = `Error: ${err.message}`;
    }
  }

  function handleAdvanceRound() {
    try {
      const res = marketInstance.advanceRound(selectedMarketId);
      updateTrigger += 1;
      stakeNotification = `Docket advanced to ${res.currentRound} phase!`;
      setTimeout(() => { stakeNotification = ''; }, 3500);
    } catch (err) {
      stakeNotification = `Error: ${err.message}`;
    }
  }

  function toggleParleyLeg(marketId, outcome) {
    if (parleySelections[marketId] === outcome) {
      const next = { ...parleySelections };
      delete next[marketId];
      parleySelections = next;
    } else {
      parleySelections = { ...parleySelections, [marketId]: outcome };
    }
  }

  function handleCreateParley() {
    parleyNotification = '';
    if (selectedParleyLegs.length < 2) {
      parleyNotification = 'Truth Parleys require at least 2 distinct claim legs.';
      return;
    }
    if (parleyStakeAmount <= 0) {
      parleyNotification = 'Parley stake amount must be positive.';
      return;
    }

    try {
      const p = marketInstance.createParley({
        stakerDid: userDid,
        legs: selectedParleyLegs.map(l => ({ marketId: l.marketId, outcome: l.outcome })),
        stakeAmount: Number(parleyStakeAmount)
      });
      updateTrigger += 1;
      parleyNotification = `Parley ticket ${p.parleyId.slice(0, 14)} confirmed! Potential payout: $${p.potentialPayout} (${p.multipliedOdds}x)`;
      parleySelections = {};
      setTimeout(() => { parleyNotification = ''; }, 5000);
    } catch (err) {
      parleyNotification = `Error: ${err.message}`;
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

  function getRoundIndex(round) {
    return ROUND_SEQUENCE.indexOf(round);
  }
</script>

<div class="market-container">
  <div class="market-header">
    <div class="header-titles">
      <h2>Validation Prediction Markets</h2>
      <p class="subtitle">4-Outcome Epistemic Betting Pools Settled via Courtroom Attestations</p>
    </div>
    
    <div class="header-controls">
      <!-- Mode Switcher -->
      <div class="mode-switcher">
        <button
          class="mode-btn {activeViewMode === VIEW_MODES.MARKETS ? 'active' : ''}"
          onclick={() => activeViewMode = VIEW_MODES.MARKETS}
        >
          <span class="material-symbols-outlined">analytics</span>
          Single Claims
        </button>
        <button
          class="mode-btn {activeViewMode === VIEW_MODES.PARLEYS ? 'active' : ''}"
          onclick={() => activeViewMode = VIEW_MODES.PARLEYS}
        >
          <span class="material-symbols-outlined">receipt_long</span>
          Truth Parleys ({userParleys.length})
        </button>
        <button
          class="mode-btn {activeViewMode === VIEW_MODES.HEDGES ? 'active' : ''}"
          onclick={() => activeViewMode = VIEW_MODES.HEDGES}
        >
          <span class="material-symbols-outlined">shield</span>
          Hedge Derivatives ({userHedges.length})
        </button>
      </div>

      <div class="total-pools-badge">
        <span class="material-symbols-outlined">payments</span>
        <span>Total Volume: <strong>$3,280 USDC</strong></span>
      </div>
    </div>
  </div>

  {#if activeViewMode === VIEW_MODES.MARKETS}
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
                <span class="round-pill">{m.currentRound.replace('_', ' ')}</span>
                <span class="pool-vol">${m.totalPool} Pool</span>
              </div>
              <p class="case-claim-snippet">{m.claimText}</p>
            </button>
          {/each}
        </div>
      </div>

      <!-- Right Column: Market Details & Poker Wagering -->
      {#if activeMarket}
        <div class="market-detail-pane">
          <div class="market-detail-card">
            <div class="detail-header">
              <span class="market-tag">MARKET ID: {activeMarket.marketId}</span>
              <span class="creator-tag">Originator: {activeMarket.creatorDid.slice(0, 16)}...</span>
            </div>

            <h3 class="detail-claim">{activeMarket.claimText}</h3>

            <!-- Poker Round Progression Stepper -->
            <div class="round-stepper-box">
              <div class="stepper-header">
                <span class="stepper-title">Poker Evidence Rounds (PRD §5.2)</span>
                <button class="btn-advance-round" onclick={handleAdvanceRound} disabled={activeMarket.currentRound === ROUNDS.SHOWDOWN}>
                  <span class="material-symbols-outlined">fast_forward</span>
                  Advance Phase
                </button>
              </div>
              <div class="stepper-bar">
                {#each ROUND_SEQUENCE as r, idx}
                  {@const activeIdx = getRoundIndex(activeMarket.currentRound)}
                  <div class="step-node {idx === activeIdx ? 'current' : idx < activeIdx ? 'completed' : 'upcoming'}">
                    <div class="step-circle">{idx + 1}</div>
                    <span class="step-label">{r.replace('_', ' ')}</span>
                  </div>
                  {#if idx < ROUND_SEQUENCE.length - 1}
                    <div class="step-line {idx < activeIdx ? 'filled' : ''}"></div>
                  {/if}
                {/each}
              </div>
            </div>

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

            <!-- Folded Status Banner -->
            {#if isUserFolded}
              <div class="folded-banner">
                <span class="material-symbols-outlined">flag</span>
                <div>
                  <strong>Position Folded</strong>
                  <p>You conceded this market early. Prior bets surrendered to the whistleblower & jury bounty pool. Remaining capital is protected.</p>
                </div>
              </div>
            {:else}
              <!-- Poker Action Bar -->
              <div class="poker-action-box">
                <div class="action-box-header">
                  <h4>Poker Round Action Bar</h4>
                  <span class="phase-tag">Phase: {activeMarket.currentRound.replace('_', ' ')}</span>
                </div>

                <div class="stake-inputs">
                  <div class="input-group">
                    <label for="outcome-select">Selected Epistemic Stance:</label>
                    <select id="outcome-select" bind:value={stakeOutcome}>
                      {#each Object.keys(OUTCOMES) as outcome}
                        <option value={outcome}>{outcome} ({activeOdds[outcome] || 1.0}x)</option>
                      {/each}
                    </select>
                  </div>

                  <div class="input-group">
                    <label for="stake-amt">Amount (USDC / Credits):</label>
                    <input
                      id="stake-amt"
                      type="number"
                      min="5"
                      step="10"
                      bind:value={stakeAmount}
                    />
                  </div>
                </div>

                <!-- Action Button Matrix -->
                <div class="action-buttons-row">
                  <button
                    class="btn-action check"
                    onclick={() => handlePokerAction(POKER_ACTIONS.CHECK)}
                    disabled={activeMarket.currentRound === ROUNDS.SHOWDOWN}
                  >
                    <span class="material-symbols-outlined">check_circle</span>
                    Check (Pass)
                  </button>

                  <button
                    class="btn-action bet"
                    onclick={() => handlePokerAction(POKER_ACTIONS.BET)}
                    disabled={activeMarket.currentRound === ROUNDS.SHOWDOWN}
                  >
                    <span class="material-symbols-outlined">add_circle</span>
                    Bet / Call (${stakeAmount})
                  </button>

                  <button
                    class="btn-action raise"
                    onclick={() => handlePokerAction(POKER_ACTIONS.RAISE)}
                    disabled={activeMarket.currentRound === ROUNDS.SHOWDOWN}
                  >
                    <span class="material-symbols-outlined">trending_up</span>
                    Raise (${stakeAmount})
                  </button>

                  <button
                    class="btn-action fold"
                    onclick={() => handlePokerAction(POKER_ACTIONS.FOLD)}
                    disabled={userTotalStakeInActive === 0}
                  >
                    <span class="material-symbols-outlined">flag</span>
                    Fold (Mitigate Loss)
                  </button>
                </div>

                {#if stakeNotification}
                  <div class="notification-banner {stakeNotification.includes('Error') ? 'error' : 'success'}">
                    {stakeNotification}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- User's Active Position in this Market -->
            <div class="user-position-section">
              <h4>Your Active Stakes in this Case (${userTotalStakeInActive} Total)</h4>
              {#if userStakes.length === 0}
                <p class="no-stakes">No active wagers placed from your connected wallet.</p>
              {:else}
                <div class="stakes-table">
                  {#each userStakes as s}
                    <div class="stake-row {s.folded ? 'folded-row' : ''}">
                      <span class="badge-outcome" style="background-color: {getOutcomeColor(s.outcome)}">{s.outcome}</span>
                      <span class="stake-val">${s.amount} USDC {s.folded ? '(FOLDED)' : ''}</span>
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
  {:else}
    <!-- Parleys View Mode -->
    <div class="parley-container">
      <div class="parley-builder-grid">
        <!-- Parley Leg Selector -->
        <div class="parley-selection-pane">
          <h3>1. Select Claims & Epistemic Outcomes (Min 2 Legs)</h3>
          <p class="section-desc">Combine independent civic dockets. Multiplied odds pay out when all claims resolve according to your prediction.</p>

          <div class="parley-dockets-list">
            {#each Array.from(marketInstance.markets.values()) as m}
              <div class="parley-docket-card {parleySelections[m.marketId] ? 'has-selection' : ''}">
                <div class="docket-header">
                  <span class="docket-title">{m.claimText}</span>
                  <span class="docket-pool">${m.totalPool} Pool</span>
                </div>

                <div class="parley-outcomes-picker">
                  {#each Object.entries(OUTCOMES) as [k, outcome]}
                    {@const odds = marketInstance.calculateOdds(m.marketId)[outcome] || 1.0}
                    {@const isSelected = parleySelections[m.marketId] === outcome}
                    <button
                      type="button"
                      class="leg-pick-btn {isSelected ? 'selected' : ''}"
                      style="--accent-col: {getOutcomeColor(outcome)}"
                      onclick={() => toggleParleyLeg(m.marketId, outcome)}
                    >
                      <span class="leg-outcome-name">{outcome}</span>
                      <span class="leg-odds">{odds}x</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Parley Slip Ticket -->
        <div class="parley-slip-pane">
          <div class="parley-slip-card">
            <div class="slip-header">
              <span class="material-symbols-outlined">receipt_long</span>
              <h3>Truth Parley Slip</h3>
            </div>

            {#if selectedParleyLegs.length === 0}
              <div class="empty-slip">
                <span class="material-symbols-outlined">touch_app</span>
                <p>Select at least 2 outcomes on the left to build your truth parley ticket.</p>
              </div>
            {:else}
              <div class="legs-list">
                {#each selectedParleyLegs as leg, idx}
                  <div class="slip-leg-item">
                    <div class="leg-info">
                      <span class="leg-index">#{idx + 1}</span>
                      <p class="leg-text">{leg.claimText.slice(0, 50)}...</p>
                    </div>
                    <div class="leg-pick-badge">
                      <span class="badge-outcome" style="background-color: {getOutcomeColor(leg.outcome)}">{leg.outcome}</span>
                      <span class="leg-odds-val">{leg.odds}x</span>
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Compounded Multiplier Breakdown -->
              <div class="slip-calc-box">
                <div class="calc-row">
                  <span>Selected Legs:</span>
                  <strong>{selectedParleyLegs.length}</strong>
                </div>
                <div class="calc-row highlight">
                  <span>Combined Odds Multiplier:</span>
                  <strong class="gold-odds">{parleyCombinedOdds}x</strong>
                </div>

                <div class="parley-stake-input-group">
                  <label for="parley-amt">Stake Amount (USDC):</label>
                  <input
                    id="parley-amt"
                    type="number"
                    min="10"
                    step="10"
                    bind:value={parleyStakeAmount}
                  />
                </div>

                <div class="calc-row potential-win">
                  <span>Potential Return:</span>
                  <strong class="green-payout">${parleyPotentialPayout} USDC</strong>
                </div>

                <button
                  class="btn-place-parley"
                  onclick={handleCreateParley}
                  disabled={selectedParleyLegs.length < 2 || parleyStakeAmount <= 0}
                >
                  <span class="material-symbols-outlined">lock</span>
                  Lock Parley Slip (${parleyStakeAmount})
                </button>

                {#if parleyNotification}
                  <div class="notification-banner {parleyNotification.includes('Error') ? 'error' : 'success'}">
                    {parleyNotification}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- User's Existing Parley Tickets -->
            <div class="user-parleys-section">
              <h4>Your Active Parley Tickets</h4>
              {#if userParleys.length === 0}
                <p class="no-stakes">No parley tickets submitted yet.</p>
              {:else}
                <div class="parleys-history-list">
                  {#each userParleys as p}
                    <div class="parley-ticket-item {p.status.toLowerCase()}">
                      <div class="ticket-top">
                        <span class="ticket-id">{p.parleyId.slice(0, 16)}</span>
                        <span class="ticket-status-badge {p.status.toLowerCase()}">{p.status}</span>
                      </div>
                      <div class="ticket-meta">
                        <span>{p.legs.length} Legs</span>
                        <span>{p.multipliedOdds}x Multiplier</span>
                        <span class="payout-val">${p.potentialPayout} USDC</span>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Layer 2: Derivative Hedge Options Dashboard (PRD §5.3) -->
  {#if activeViewMode === VIEW_MODES.HEDGES}
    <div class="parley-builder-layout">
      <div class="parley-builder-grid">
        <!-- Left: Put/Call Hedge Builder -->
        <div class="legs-selection-pane">
          <div class="parley-banner">
            <span class="material-symbols-outlined">shield</span>
            <div>
              <h3>Derivative Hedge Options Builder</h3>
              <p>Purchase Put options to safeguard capital against sudden adverse evidence, or Call options for leveraged upside.</p>
            </div>
          </div>

          <div class="legs-list" style="margin-top: 1.25rem;">
            <div class="leg-card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
              <div class="form-group" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-size: 0.85rem; color: #94a3b8; font-weight: 600;">SELECT CLAIM TO HEDGE</label>
                <select bind:value={hedgeMarketId} style="background: #0f172a; color: #e2e8f0; border: 1px solid #334155; padding: 0.6rem 0.8rem; border-radius: 6px;">
                  {#each Array.from(marketInstance.markets.values()) as m}
                    <option value={m.marketId}>{m.claimText.slice(0, 60)}...</option>
                  {/each}
                </select>
              </div>

              <div class="form-group" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-size: 0.85rem; color: #94a3b8; font-weight: 600;">DERIVATIVE TYPE</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                  <button
                    type="button"
                    class="outcome-btn {hedgeType === 'PUT' ? 'selected' : ''}"
                    style="{hedgeType === 'PUT' ? 'border-color: #3b82f6; background: rgba(59, 130, 246, 0.15);' : ''}"
                    onclick={() => hedgeType = 'PUT'}
                  >
                    PUT (Capital Protection)
                  </button>
                  <button
                    type="button"
                    class="outcome-btn {hedgeType === 'CALL' ? 'selected' : ''}"
                    style="{hedgeType === 'CALL' ? 'border-color: #10b981; background: rgba(16, 185, 129, 0.15);' : ''}"
                    onclick={() => hedgeType = 'CALL'}
                  >
                    CALL (Leveraged Upside)
                  </button>
                </div>
              </div>

              <div class="form-group" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-size: 0.85rem; color: #94a3b8; font-weight: 600;">TARGET OUTCOME</label>
                <div class="outcome-selector-pills">
                  {#each Object.keys(OUTCOMES) as outcome}
                    <button
                      type="button"
                      class="outcome-btn {hedgeOutcome === outcome ? 'selected' : ''}"
                      style="{hedgeOutcome === outcome ? `border-color: ${getOutcomeColor(outcome)}; color: ${getOutcomeColor(outcome)};` : ''}"
                      onclick={() => hedgeOutcome = outcome}
                    >
                      {outcome}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="form-group" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-size: 0.85rem; color: #94a3b8; font-weight: 600;">NOTIONAL COVERAGE (USDC)</label>
                <input
                  type="number"
                  min="10"
                  max="10000"
                  bind:value={hedgeNotional}
                  style="background: #0f172a; color: #e2e8f0; border: 1px solid #334155; padding: 0.6rem 0.8rem; border-radius: 6px;"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Hedge Ticket & Active Options -->
        <div class="ticket-slip-pane">
          <div class="ticket-card">
            <div class="ticket-header">
              <span class="material-symbols-outlined">verified_user</span>
              <h3>Derivative Option Quote</h3>
            </div>

            <div class="ticket-summary">
              <div class="summary-row">
                <span>Option Type:</span>
                <strong>{hedgeType} ({hedgeOutcome})</strong>
              </div>
              <div class="summary-row">
                <span>Strike Odds:</span>
                <strong>{hedgeQuote.strikeOdds}x</strong>
              </div>
              <div class="summary-row">
                <span>Option Premium (Cost):</span>
                <strong style="color: #f59e0b;">${hedgeQuote.premium} USDC</strong>
              </div>
              <div class="summary-row payout-row">
                <span>Potential Payout:</span>
                <strong class="payout-amount">${hedgeQuote.potentialPayout} USDC</strong>
              </div>
            </div>

            <button class="place-parley-btn" onclick={handleBuyHedge}>
              <span class="material-symbols-outlined">lock</span>
              Confirm & Purchase {hedgeType} Option
            </button>

            {#if hedgeNotification}
              <p class="notification-text" style="color: #10b981; margin-top: 0.75rem; text-align: center;">{hedgeNotification}</p>
            {/if}

            <div class="user-parleys-section" style="margin-top: 1.5rem;">
              <h4>Your Active Hedge Contracts</h4>
              {#if userHedges.length === 0}
                <p class="no-stakes">No active hedge options purchased yet.</p>
              {:else}
                <div class="parleys-history-list">
                  {#each userHedges as h}
                    <div class="parley-ticket-item {h.status.toLowerCase()}">
                      <div class="ticket-top">
                        <span class="ticket-id">{h.type} • {h.targetOutcome}</span>
                        <span class="ticket-status-badge {h.status.toLowerCase()}">{h.status}</span>
                      </div>
                      <div class="ticket-meta">
                        <span>${h.notionalAmount} Notional</span>
                        <span>${h.premium} Premium</span>
                        <span class="payout-val">${h.payout} Payout</span>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Loss Mitigation Fold Modal -->
  {#if isFoldModalOpen}
    <div class="modal-backdrop">
      <div class="fold-modal-card">
        <div class="modal-icon-badge">
          <span class="material-symbols-outlined">flag</span>
        </div>
        <h3>Concede Market Position (Fold)</h3>
        <p class="modal-explainer">
          In accordance with the <strong>Poker-Style Loss Mitigation Rules (PRD §5.2)</strong>, folding concedes your prediction before Showdown.
        </p>
        <div class="fold-rules-box">
          <div class="rule-item">
            <span class="material-symbols-outlined text-warning">arrow_forward</span>
            <span>Surrender <strong>${userTotalStakeInActive} USDC</strong> prior wagers to the evidence bounty pool.</span>
          </div>
          <div class="rule-item">
            <span class="material-symbols-outlined text-success">verified_user</span>
            <span>Safeguards your remaining balance against upcoming round raises and showdown loss.</span>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" onclick={() => isFoldModalOpen = false}>Cancel & Hold</button>
          <button class="btn-confirm-fold" onclick={confirmFold}>Confirm Fold & Concede</button>
        </div>
      </div>
    </div>
  {/if}
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

  /* Mode Switcher */
  .header-controls {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .mode-switcher {
    display: flex;
    background: var(--bg-surface, #0f172a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    padding: 3px;
    gap: 4px;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mode-btn.active {
    background: var(--accent-gold, #f59e0b);
    color: #000000;
    font-weight: 700;
  }

  .round-pill {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(139, 92, 246, 0.2);
    color: #c4b5fd;
    text-transform: uppercase;
  }

  /* Poker Round Stepper */
  .round-stepper-box {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .stepper-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .stepper-title {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-advance-round {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(139, 92, 246, 0.15);
    border: 1px solid rgba(139, 92, 246, 0.4);
    color: #c4b5fd;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-advance-round:hover:not(:disabled) {
    background: rgba(139, 92, 246, 0.3);
  }

  .btn-advance-round:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .stepper-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .step-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    z-index: 1;
  }

  .step-circle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--bg-card, #1e293b);
    border: 2px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted, #94a3b8);
    transition: all 0.2s ease;
  }

  .step-node.current .step-circle {
    border-color: var(--accent-gold, #f59e0b);
    background: rgba(245, 158, 11, 0.2);
    color: var(--accent-gold, #f59e0b);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
  }

  .step-node.completed .step-circle {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  .step-label {
    font-size: 0.68rem;
    color: var(--text-muted, #94a3b8);
    text-transform: capitalize;
  }

  .step-node.current .step-label {
    color: var(--accent-gold, #f59e0b);
    font-weight: 700;
  }

  .step-line {
    flex: 1;
    height: 2px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 8px;
    margin-bottom: 18px;
  }

  .step-line.filled {
    background: #10b981;
  }

  /* Folded Banner */
  .folded-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.4);
    padding: 16px;
    border-radius: 10px;
    color: #ef4444;
    margin-bottom: 24px;
  }

  .folded-banner strong {
    font-size: 0.95rem;
  }

  .folded-banner p {
    font-size: 0.8rem;
    color: var(--text-muted, #94a3b8);
    margin: 4px 0 0 0;
  }

  .folded-row {
    opacity: 0.5;
    text-decoration: line-through;
  }

  /* Poker Action Box */
  .poker-action-box {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    padding: 18px;
    border-radius: 10px;
    margin-bottom: 24px;
  }

  .action-box-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .phase-tag {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--accent-gold, #f59e0b);
    background: rgba(245, 158, 11, 0.1);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .action-buttons-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 14px;
  }

  @media (max-width: 650px) {
    .action-buttons-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .btn-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 700;
    border: none;
    padding: 10px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-action.check {
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
  }
  .btn-action.check:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.16);
  }

  .btn-action.bet {
    background: linear-gradient(135deg, #10b981, #059669);
    color: #ffffff;
  }
  .btn-action.bet:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-action.raise {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #000000;
  }
  .btn-action.raise:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-action.fold {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }
  .btn-action.fold:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.3);
  }

  .btn-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Parley View Styles */
  .parley-container {
    margin-top: 8px;
  }

  .parley-builder-grid {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 24px;
  }

  @media (max-width: 900px) {
    .parley-builder-grid {
      grid-template-columns: 1fr;
    }
  }

  .parley-selection-pane h3 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 4px;
  }

  .section-desc {
    font-size: 0.82rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 18px;
  }

  .parley-dockets-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .parley-docket-card {
    background: var(--bg-surface, #0f172a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    padding: 16px;
    transition: all 0.2s ease;
  }

  .parley-docket-card.has-selection {
    border-color: rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.02);
  }

  .docket-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
  }

  .docket-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.4;
  }

  .docket-pool {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent-gold, #f59e0b);
    white-space: nowrap;
  }

  .parley-outcomes-picker {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  @media (max-width: 600px) {
    .parley-outcomes-picker {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .leg-pick-btn {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .leg-pick-btn:hover {
    border-color: var(--accent-col);
  }

  .leg-pick-btn.selected {
    border-color: var(--accent-col);
    background: rgba(245, 158, 11, 0.12);
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.25);
  }

  .leg-outcome-name {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--accent-col);
  }

  .leg-odds {
    font-size: 0.85rem;
    font-weight: 800;
    color: #ffffff;
    margin-top: 4px;
  }

  /* Parley Slip Card */
  .parley-slip-card {
    background: var(--bg-surface, #0f172a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    padding: 20px;
    position: sticky;
    top: 20px;
  }

  .slip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  }

  .slip-header h3 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .empty-slip {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-muted, #94a3b8);
  }

  .empty-slip span {
    font-size: 2.2rem;
    opacity: 0.4;
    margin-bottom: 8px;
  }

  .empty-slip p {
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .legs-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .slip-leg-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.03);
    padding: 8px 12px;
    border-radius: 8px;
  }

  .leg-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .leg-index {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--accent-gold, #f59e0b);
  }

  .leg-text {
    font-size: 0.76rem;
    color: #f8fafc;
    margin: 0;
  }

  .leg-pick-badge {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .leg-odds-val {
    font-size: 0.8rem;
    font-weight: 700;
    color: #ffffff;
  }

  .slip-calc-box {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 20px;
  }

  .calc-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.82rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 8px;
  }

  .calc-row.highlight {
    padding: 6px 0;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
    border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  }

  .gold-odds {
    color: var(--accent-gold, #f59e0b);
    font-size: 1.1rem;
  }

  .green-payout {
    color: #10b981;
    font-size: 1.15rem;
  }

  .parley-stake-input-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 10px 0;
  }

  .parley-stake-input-group label {
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
  }

  .parley-stake-input-group input {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: #ffffff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .btn-place-parley {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #000000;
    font-weight: 700;
    font-size: 0.85rem;
    border: none;
    padding: 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: filter 0.2s ease;
  }

  .btn-place-parley:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-place-parley:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* User Parleys History */
  .user-parleys-section {
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    padding-top: 16px;
  }

  .parleys-history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .parley-ticket-item {
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid #94a3b8;
    padding: 10px 12px;
    border-radius: 6px;
  }

  .parley-ticket-item.won {
    border-left-color: #10b981;
  }

  .parley-ticket-item.lost {
    border-left-color: #ef4444;
  }

  .parley-ticket-item.pending {
    border-left-color: #f59e0b;
  }

  .ticket-top {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    margin-bottom: 4px;
  }

  .ticket-status-badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .ticket-status-badge.won {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .ticket-status-badge.lost {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .ticket-status-badge.pending {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .ticket-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
  }

  .payout-val {
    color: #f8fafc;
    font-weight: 700;
  }

  /* Fold Modal Backdrop & Card */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .fold-modal-card {
    background: var(--bg-surface, #0f172a);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 16px;
    padding: 24px;
    max-width: 440px;
    width: 90%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  .modal-icon-badge {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }

  .fold-modal-card h3 {
    font-size: 1.15rem;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 8px;
  }

  .modal-explainer {
    font-size: 0.82rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.4;
    margin-bottom: 16px;
  }

  .fold-rules-box {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }

  .rule-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.78rem;
    color: #f8fafc;
    line-height: 1.4;
  }

  .text-warning {
    color: #f59e0b;
    font-size: 1.1rem;
  }

  .text-success {
    color: #10b981;
    font-size: 1.1rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-confirm-fold {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #ffffff;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: filter 0.2s ease;
  }

  .btn-confirm-fold:hover {
    filter: brightness(1.1);
  }
</style>
