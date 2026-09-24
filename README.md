# ⚖️ veracities.social · Protocol & Settlement Backend

> Headless Identity Broker, Validation Market Staking Registry, Epistemic DAO ("EnDAOsment"), and Courtroom Settlement Protocol for the Vera ecosystem.

---

## 🏗️ Architecture Blueprint

`veracities.social` provides the decentralized protocol and settlement backend powering the user-facing social application ([`mrtingalingling/clearCloud`](https://github.com/mrtingalingling/clearCloud)) and consuming on-device local AI from [`mrtingalingling/vera`](https://github.com/mrtingalingling/vera):

```mermaid
graph TD
    subgraph Layer0 ["Layer 0 & Ingestion Engine (mrtingalingling/vera)"]
        V_Engine["Core Heuristics & Local AI"]
        V_Nano["On-Device Chrome Gemini Nano"]
        V_Scrub["Private Messaging PII Scrubber (Feature 1.2)"]
    end

    subgraph LayerProtocol ["Protocol & Settlement Backend (mrtingalingling/veracities.social)"]
        P_Auth["Identity Broker Interface"]
        P_ATProto["ATProto Agent & DID:PLC"]
        P_Web3["NFT & Web3 SIWE Interface"]
        P_Market["Validation Market Registry"]
        P_DAO["Epistemic DAO Governance Registry"]
        P_Settle["Courtroom Settlement Protocol"]
        P_Proxy["UUPS / ERC-1967 Proxies & Modular DAO Adapters"]
    end

    subgraph LayerApp ["Unified Social Application (mrtingalingling/clearCloud)"]
        A_Feed["The Feed & Relational Circles (Feature 1.1)"]
        A_Grounded["Groundedness Index & Hidden Reputation"]
        A_Guard["Reputation Stake Guard & Credit Score (Feature 1.4)"]
        A_Court["The Courtroom Deliberation Forum (Feature 1.3)"]
        A_Overlay["Social Overlays (X, Bluesky, Reddit)"]
    end

    Layer0 -->|"Supplies local AI, PII scrubber & attestations"| LayerApp
    Layer0 -.->|"Initiates Case Docket via Extension"| A_Court
    LayerApp -->|"Dispatches validation wagers & case dockets"| P_Market
    LayerApp -->|"Dispatches M-of-N signed juror attestations"| LayerProtocol
    LayerProtocol -->|"Provides ATProto Auth & Staking Settlement Protocol"| LayerApp
    P_Proxy -.->|"Wraps & upgrades contracts"| P_Market
```

Detailed specification available in [**`docs/architecture.md`**](./docs/architecture.md).

---

## 🌟 Protocol Subsystems

1. **Identity Broker Subsystem (`src/identity/`)**:
   - ATProto (`@atproto/api` BskyAgent, `did:plc` resolution, custom `social.veracities.*` lexicons).
   - Web3 SIWE (EIP-4361 cryptographic challenge signing, W3C `did:pkh` resolution, `siweLink.js`).
2. **Validation Market Subsystem (`src/market/`)**:
   - Prediction market staking pools, dynamic odds, and automated settlement across Vera's 4 epistemic outcomes (`VERIFIED`, `DISPUTED`, `MISINFORMED`, `NEED_CONTEXT`).
   - 4-Stage Poker Evidence Wagering Rounds (`Pre-Flop`, `Evidence Drop`, `Cross-Exam`, `Showdown`) with loss-mitigation `Fold` actions.
   - Truth Parleys Ticket Builder with compounded payout multiplier calculation.
   - Epistemic Put & Call derivative hedge options for downside protection and conviction leverage.
   - Losing stake slashing waterfall: **15% Whistleblower Bounty**, **5% Juror Deliberation Fee**, **5% Protocol Fee**.
3. **Epistemic DAO Subsystem ("EnDAOsment") (`src/governance/`, `contracts/EpistemicCrsManager.sol`)**:
   - Multi-dimensional Epistemic Quotient ($EQ$) formula based on Factuality, Bridging, Steel-Manning, and Toxicity penalty.
   - Quadratic tier voting multipliers (Novice: 1, Contributor: 5, Arbiter: 15, Sage Elder: 30).
   - Zero-Knowledge Semaphore identity bridge (`zkSemaphoreBridge.js`) and client-side anonymous voting with single-use nullifiers.
   - Non-plutocratic two-stage deliberation pipeline adapting the EnDAOsment Smart Contract Framework (`ApprovalGovernor` Stage 1 + `QuadraticGovernor` Stage 2 with quadratic credit budgets $V = \lfloor\sqrt{C}\rfloor$).
4. **Courtroom Settlement & Oracles (`src/settlement/`, `src/oracle/`)**:
   - 14-day cold case refund distribution (**94% refunded**, **6% protocol fee** retained).
   - Challenge bond retrial escrow (50% bounty reward for overturned verdicts).
   - $M$-of-$N$ EIP-712 threshold multi-signature citizen oracle relayer (`oracleRelayer.js`).
5. **EVM Smart Contracts (`contracts/`)**:
   - `ValidationMarket.sol`: UUPS / ERC-1967 upgradeable prediction market, dynamic domain separator, slashing waterfall, and EIP-712 settlement.
   - `CourtroomEscrow.sol`: UUPS / ERC-1967 upgradeable 14-day cold case escrow refunds and retrial bonds.
   - `EpistemicGovernor.sol`: UUPS / ERC-1967 upgradeable Semaphore ZK anonymous governance with quadratic tier weights and modular DAO framework interoperability (OpenZeppelin Governor, Gnosis Safe / Zodiac, Aragon OSx, EnDAOsment Framework).
   - `EpistemicCrsManager.sol`: UUPS / ERC-1967 upgradeable reputation manager implementing `ICrsManager` with historical block-level snapshots (`Checkpoints`), mapping Epistemic Tiers to snapshotted voting weights and quadratic credit budgets (Novice: 100, Contributor: 500, Arbiter: 1,500, Sage Elder: 3,000 credits). Checkpointing at block numbers prevents flash-loan / flash-reputation manipulation.
   - `proxy/`: Canonical ERC-1967 delegating proxy (`ERC1967Proxy.sol`), initialization guard (`Initializable.sol`), and UUPS upgrade mechanism (`UUPSUpgradeable.sol`).
   - Compiled with Solc 0.8.20 optimizer (200 runs, viaIR: true), artifacts exported to `src/config/contracts.json`.
6. **Interactive Svelte 5 Interface**:
   - Dedicated navigation tabs: `MARKETS` (`MarketView.svelte`), `ESCROW` (`EscrowSettlementView.svelte`), `ORACLE` (`OracleAttestationView.svelte`), and `GOVERNANCE` (`GovernanceView.svelte` with Proxy & Framework cockpit).

---

## 🏛️ DAO Framework Integration: EnDAOsment Epistemic Adaptation

The [**Vera Truth-Settlement Ecosystem**](https://github.com/mrtingalingling/veracities.social) adapts the external [`DAO-Smart-Contract-Framework`](https://github.com/mrtingalingling/DAO-Smart-Contract-Framework) ("EnDAOsment") to power **non-plutocratic Epistemic DAO governance**, maintaining all custom contracts strictly within `veracities.social` while leaving the upstream framework untouched:

1. **Checkpointed Epistemic CRS (`EpistemicCrsManager.sol`)**:
   - Implements `ICrsManager` using OpenZeppelin-compatible historical block-level checkpoints.
   - Maps Vera's 4 Epistemic Tiers to snapshotted voting weights and quadratic credit budgets:
     - *Tier 1 (Novice)*: 100 Credits
     - *Tier 2 (Contributor)*: 500 Credits
     - *Tier 3 (Arbiter)*: 1,500 Credits
     - *Tier 4 (Sage Elder)*: 3,000 Credits
   - Checkpointing at block numbers (`getPastCrs`) prevents flash-loan and flash-reputation manipulation, ensuring voting power is determined strictly at the proposal snapshot block.
2. **Two-Stage Deliberation Pipeline**:
   - **Stage 1 (Epistemic Approval Vetting)**: Sages and Arbiters evaluate the qualitative truth and platform safety of proposals via `ApprovalGovernor.sol` with quadratic tier weights ($W \in \{1, 5, 15, 30\}$).
   - **Stage 2 (Quadratic Voting with Credit Budgets)**: Citizens allocate credits ($C$) where voting weight scales quadratically as $V = \lfloor\sqrt{C}\rfloor$ ($C = V^2$) via `QuadraticGovernor.sol`, dampening plutocracy and factional brigading.
3. **Safe Timelock Execution**: Approved proposals transition to `TimelockControllerUpgradeable` for a 24–48h public inspection delay prior to on-chain execution.
4. **Upgrade Resilience & Decoupling (What Happens if the Framework Updates)**:
   - **Storage Decoupling**: All contracts run behind independent UUPS / ERC-1967 proxies with reserved storage gaps (`uint256[45..48] private __gap;`). Upgrading the upstream framework's logic via `upgradeToAndCall` only alters the implementation address; all existing proposals, votes, member badges, CRS reputation checkpoints, and credit balances remain intact in persistent proxy storage.
   - **Runtime Reconfiguration**: Vera's `EpistemicGovernor.sol` connects via modular adapter interfaces (`configureParentDAO(ParentFramework.ENDAOSMENT, targetAddress)`). Non-breaking framework updates require zero downtime; breaking changes can be re-pointed dynamically or adapted via UUPS upgrade with zero platform downtime.
   - **Independent Heuristics**: Epistemic scoring formulas ($EQ$) remain fully autonomous inside `EpistemicCrsManager.sol`. If the parent framework undergoes an emergency pause or freeze, Vera can fall back to standalone execution or alternative adapters (OpenZeppelin, Gnosis Safe Zodiac, Aragon OSx).

---

## 🚀 Quickstart & Testing

```bash
npm install
npm test # Runs 97/97 passing Vitest tests across 16 suites
npm run compile:contracts # Compiles Solidity contracts via Solc optimizer
npm run dev # Starts local Svelte 5 dev server on port 5174
```

Detailed architectural specifications, caveats, and deployment runbooks are documented in [**`docs/architecture.md`**](./docs/architecture.md) and canonical [**`vera/docs/ARCHITECTURE_CAVEATS_AND_ROADMAP.md`**](../vera/docs/ARCHITECTURE_CAVEATS_AND_ROADMAP.md).
