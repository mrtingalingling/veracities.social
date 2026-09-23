<script>
  import { verdictAttestationService } from '../attestation/verdictAttestation.js';
  import { ValidationMarket, OUTCOMES } from '../market/validationMarket.js';

  let {
    marketInstance = new ValidationMarket()
  } = $props();

  let caseId = $state('case_co2_2024');
  let claimText = $state('Global atmospheric CO2 concentrations reached 420 ppm in 2024.');
  let verdict = $state(OUTCOMES.VERIFIED);
  let confidence = $state(0.92);
  let jurySize = $state(18);
  let secretKey = $state('veracities_oracle_secret');

  let generatedAttestation = $state(null);
  let verificationResult = $state(null);
  let settlementResult = $state(null);
  let errorMessage = $state('');

  function handleGenerateAttestation() {
    errorMessage = '';
    verificationResult = null;
    settlementResult = null;

    try {
      generatedAttestation = verdictAttestationService.createVerdictAttestation({
        caseId,
        claimText,
        verdict,
        confidence: Number(confidence),
        jurySize: Number(jurySize),
        secretKey
      });
    } catch (err) {
      errorMessage = err.message;
    }
  }

  function handleVerifyAndSettle() {
    errorMessage = '';
    if (!generatedAttestation) return;

    try {
      // 1. Verify attestation
      const v = verdictAttestationService.verifyVerdictAttestation(generatedAttestation, secretKey);
      verificationResult = v;

      if (!v.valid) {
        errorMessage = `Attestation verification rejected: ${v.reason}`;
        return;
      }

      // 2. Atomic settlement
      const targetMarketId = `market_${caseId}`;
      if (!marketInstance.markets.has(targetMarketId)) {
        // Auto-seed market if not found
        marketInstance.createMarket({
          claimId: caseId,
          claimText,
          creatorDid: 'did:plc:originator',
          initialBounty: 200
        });
        marketInstance.placeStake({
          marketId: targetMarketId,
          stakerDid: 'did:pkh:0xAliceWinner',
          outcome: verdict,
          amount: 300
        });
        marketInstance.placeStake({
          marketId: targetMarketId,
          stakerDid: 'did:pkh:0xBobOther',
          outcome: OUTCOMES.MISINFORMED,
          amount: 150
        });
      }

      const receipt = marketInstance.settleMarket(targetMarketId, v.verdict);
      settlementResult = receipt;
    } catch (err) {
      errorMessage = err.message;
    }
  }
</script>

<div class="attestation-container">
  <div class="attestation-header">
    <h2>Courtroom $\rightarrow$ Market Oracle Attestation Console</h2>
    <p class="subtitle">EIP-712 / HMAC Cryptographic Signing & Anti-Replay Oracle Settlement Bridge</p>
  </div>

  <div class="attestation-grid">
    <!-- Left Column: Generate Attestation -->
    <div class="pane card">
      <h3>1. Sign Courtroom Verdict Attestation</h3>
      <div class="form-grid">
        <div class="input-field">
          <label for="attest-case">Case ID:</label>
          <input id="attest-case" type="text" bind:value={caseId} />
        </div>

        <div class="input-field">
          <label for="attest-claim">Empirical Claim:</label>
          <input id="attest-claim" type="text" bind:value={claimText} />
        </div>

        <div class="input-row">
          <div class="input-field">
            <label for="attest-verdict">Consensus Verdict:</label>
            <select id="attest-verdict" bind:value={verdict}>
              {#each Object.keys(OUTCOMES) as o}
                <option value={o}>{o}</option>
              {/each}
            </select>
          </div>

          <div class="input-field">
            <label for="attest-conf">Confidence Score:</label>
            <input id="attest-conf" type="number" step="0.01" min="0" max="1" bind:value={confidence} />
          </div>

          <div class="input-field">
            <label for="attest-jury">Jury Quorum Size:</label>
            <input id="attest-jury" type="number" min="1" bind:value={jurySize} />
          </div>
        </div>

        <div class="input-field">
          <label for="attest-key">Oracle Secret / Signing Key:</label>
          <input id="attest-key" type="password" bind:value={secretKey} />
        </div>

        <button class="btn-primary" onclick={handleGenerateAttestation}>
          <span class="material-symbols-outlined">key</span>
          Generate & Cryptographically Sign Attestation
        </button>
      </div>

      {#if generatedAttestation}
        <div class="json-preview-box">
          <div class="preview-header">
            <span>Signed Attestation Payload</span>
            <span class="badge-status">VALID HASH</span>
          </div>
          <pre><code>{JSON.stringify(generatedAttestation, null, 2)}</code></pre>
        </div>
      {/if}
    </div>

    <!-- Right Column: Verify & Settle Market -->
    <div class="pane card">
      <h3>2. Oracle Verification & Market Settlement</h3>
      <p class="section-desc">
        Submits the cryptographic payload to the protocol. Verifies payload integrity, checks replay prevention nonces,
        and atomically unlocks prediction pools.
      </p>

      <button
        class="btn-settle"
        disabled={!generatedAttestation}
        onclick={handleVerifyAndSettle}
      >
        <span class="material-symbols-outlined">verified_user</span>
        Verify Signature & Execute Settlement
      </button>

      {#if errorMessage}
        <div class="status-banner error">
          <span class="material-symbols-outlined">error</span>
          <span>{errorMessage}</span>
        </div>
      {/if}

      {#if verificationResult}
        <div class="status-banner {verificationResult.valid ? 'success' : 'error'}">
          <span class="material-symbols-outlined">{verificationResult.valid ? 'check_circle' : 'cancel'}</span>
          <span>
            {verificationResult.valid
              ? `Cryptographic signature verified! Verdict [${verificationResult.verdict}] validated.`
              : `Verification Failed: ${verificationResult.reason}`}
          </span>
        </div>
      {/if}

      {#if settlementResult}
        <div class="settlement-summary">
          <h4>Settlement Receipt</h4>
          <div class="receipt-grid">
            <div class="r-item">
              <span>Status:</span>
              <strong class="text-green">{settlementResult.status}</strong>
            </div>
            <div class="r-item">
              <span>Winning Verdict:</span>
              <strong>{settlementResult.verdict}</strong>
            </div>
            <div class="r-item">
              <span>Total Pool:</span>
              <strong>${settlementResult.totalPool}</strong>
            </div>
            <div class="r-item">
              <span>Protocol Fee:</span>
              <strong>${settlementResult.protocolCut} (5%)</strong>
            </div>
          </div>

          <h5 class="payout-heading">Liquidity Payouts</h5>
          <div class="payout-list">
            {#each settlementResult.payouts as p}
              <div class="payout-row">
                <span class="staker-id">{p.stakerDid}</span>
                <span class="payout-amt">+${p.payout} USDC (${p.profit} Profit)</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .attestation-container {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 20px;
  }

  .attestation-header h2 {
    font-size: 1.5rem;
    font-weight: 800;
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 24px;
  }

  .attestation-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  @media (max-width: 860px) {
    .attestation-grid {
      grid-template-columns: 1fr;
    }
  }

  .card {
    background: var(--bg-surface, #0f172a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    padding: 24px;
  }

  .pane h3 {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 16px;
    color: var(--text-main, #f8fafc);
  }

  .section-desc {
    font-size: 0.82rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.5;
    margin-bottom: 18px;
  }

  .form-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .input-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 10px;
  }

  .input-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .input-field label {
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
  }

  .input-field input, .input-field select {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    color: #ffffff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #10b981, #059669);
    color: #ffffff;
    font-weight: 700;
    font-size: 0.85rem;
    border: none;
    padding: 10px;
    border-radius: 6px;
    cursor: pointer;
    margin-top: 8px;
  }

  .btn-settle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
    color: #ffffff;
    font-weight: 700;
    font-size: 0.88rem;
    border: none;
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 16px;
  }

  .btn-settle:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .json-preview-box {
    margin-top: 18px;
    background: #020617;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    padding: 12px;
    max-height: 220px;
    overflow-y: auto;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 8px;
  }

  .badge-status {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 700;
  }

  pre {
    font-size: 0.72rem;
    color: #a5f3fc;
    line-height: 1.4;
  }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.82rem;
    margin-bottom: 16px;
  }

  .status-banner.success {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid #10b981;
    color: #10b981;
  }

  .status-banner.error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    color: #ef4444;
  }

  .settlement-summary {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    padding: 16px;
  }

  .settlement-summary h4 {
    font-size: 0.95rem;
    font-weight: 700;
    margin-bottom: 12px;
  }

  .receipt-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-size: 0.8rem;
    margin-bottom: 16px;
  }

  .r-item {
    display: flex;
    justify-content: space-between;
    color: var(--text-muted, #94a3b8);
  }

  .r-item strong {
    color: #f8fafc;
  }

  .text-green { color: #10b981 !important; }

  .payout-heading {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 8px;
    text-transform: uppercase;
  }

  .payout-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .payout-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    background: rgba(0, 0, 0, 0.2);
    padding: 6px 10px;
    border-radius: 4px;
  }

  .staker-id {
    color: var(--text-muted, #94a3b8);
    font-family: monospace;
  }

  .payout-amt {
    color: #10b981;
    font-weight: 700;
  }
</style>
