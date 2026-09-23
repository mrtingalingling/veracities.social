<script>
  import MarketView from './components/MarketView.svelte';
  import EscrowSettlementView from './components/EscrowSettlementView.svelte';
  import OracleAttestationView from './components/OracleAttestationView.svelte';
  import { ValidationMarket } from './market/validationMarket.js';
  import { CourtroomSettlementService } from './settlement/courtroomSettlement.js';

  const TABS = {
    MARKETS: 'MARKETS',
    ESCROW: 'ESCROW',
    ORACLE: 'ORACLE'
  };

  let activeTab = $state(TABS.MARKETS);

  // Shared singleton protocol state instances
  const sharedMarket = new ValidationMarket();
  const sharedSettlement = new CourtroomSettlementService();

  let userWallet = $state({
    address: '0x71C8360f3a1591E108f20387b925b39F11FaB19',
    did: 'did:pkh:eip155:1:0x71C8360f3a1591E108f20387b925b39F11FaB19',
    network: 'Base L2',
    balance: '4,500 USDC'
  });
</script>

<div class="protocol-layout">
  <!-- Top Protocol Bar -->
  <header class="protocol-header">
    <div class="header-inner">
      <div class="brand">
        <div class="brand-badge">
          <span class="material-symbols-outlined">balance</span>
        </div>
        <div class="brand-titles">
          <h1>veracities.social</h1>
          <span class="tagline">Decentralized Epistemic Settlement & Validation Protocol</span>
        </div>
      </div>

      <div class="header-right">
        <div class="metric-pill">
          <span class="m-label">Protocol TVL</span>
          <span class="m-val text-gold">$1,240,000 USDC</span>
        </div>

        <div class="wallet-badge">
          <span class="network-dot"></span>
          <span class="network-name">{userWallet.network}</span>
          <span class="address-mono">{userWallet.address.slice(0, 6)}...{userWallet.address.slice(-4)}</span>
          <span class="balance-tag">{userWallet.balance}</span>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <nav class="nav-bar">
      <button
        class="nav-tab {activeTab === TABS.MARKETS ? 'active' : ''}"
        onclick={() => activeTab = TABS.MARKETS}
      >
        <span class="material-symbols-outlined">trending_up</span>
        <span>Validation Prediction Markets</span>
      </button>

      <button
        class="nav-tab {activeTab === TABS.ESCROW ? 'active' : ''}"
        onclick={() => activeTab = TABS.ESCROW}
      >
        <span class="material-symbols-outlined">lock_clock</span>
        <span>Escrow, Cold Cases & Retrial Bonds</span>
      </button>

      <button
        class="nav-tab {activeTab === TABS.ORACLE ? 'active' : ''}"
        onclick={() => activeTab = TABS.ORACLE}
      >
        <span class="material-symbols-outlined">verified</span>
        <span>Courtroom Oracle Attestation Bridge</span>
      </button>
    </nav>
  </header>

  <!-- Main View -->
  <main class="content-viewport">
    {#if activeTab === TABS.MARKETS}
      <MarketView userDid={userWallet.did} marketInstance={sharedMarket} />
    {:else if activeTab === TABS.ESCROW}
      <EscrowSettlementView userDid={userWallet.did} settlementService={sharedSettlement} />
    {:else if activeTab === TABS.ORACLE}
      <OracleAttestationView marketInstance={sharedMarket} />
    {/if}
  </main>
</div>

<style>
  .protocol-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-page, #080c14);
  }

  .protocol-header {
    background: var(--bg-surface, #0f172a);
    border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-inner {
    max-width: 1040px;
    margin: 0 auto;
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-badge {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #000000;
    box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
  }

  .brand-titles h1 {
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, #ffffff, #e2e8f0);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .metric-pill {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.2);
    padding: 4px 10px;
    border-radius: 8px;
  }

  .m-label {
    font-size: 0.62rem;
    text-transform: uppercase;
    color: var(--text-muted, #94a3b8);
  }

  .m-val {
    font-size: 0.85rem;
    font-weight: 700;
  }

  .text-gold { color: #f59e0b; }

  .wallet-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.78rem;
  }

  .network-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
  }

  .network-name {
    color: var(--text-muted, #94a3b8);
    font-weight: 600;
  }

  .address-mono {
    font-family: monospace;
    font-weight: 600;
    color: #f8fafc;
  }

  .balance-tag {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 700;
    color: #f59e0b;
    font-size: 0.72rem;
  }

  .nav-bar {
    max-width: 1040px;
    margin: 0 auto;
    display: flex;
    padding: 0 20px;
    gap: 12px;
    overflow-x: auto;
  }

  .nav-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted, #94a3b8);
    font-size: 0.86rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .nav-tab:hover {
    color: #ffffff;
  }

  .nav-tab.active {
    color: #f59e0b;
    border-bottom-color: #f59e0b;
  }

  .content-viewport {
    flex: 1;
  }
</style>
