# veracities.social Architecture Blueprint (Protocol & Settlement Backend)

## 1. Overview in the Vera Ecosystem

`veracities.social` serves as the **headless Protocol & Settlement Backend** of the Vera decentralized truth network. It provides identity broking, truth prediction staking pools, epistemic DAO governance, and formal courtroom settlement rules.

```mermaid
graph TD
    subgraph Layer0 ["Layer 0 & Ingestion Engine (mrtingalingling/vera)"]
        V_Engine["Core Heuristics & Local AI"]
        V_Nano["On-Device Chrome Gemini Nano"]
        V_Scrub["Private Messaging PII Scrubber (Feature 1.2)"]
        V_P2P["Gossip Swarm Attestation"]
    end

    subgraph LayerProtocol ["Protocol & Settlement Backend (mrtingalingling/veracities.social)"]
        P_Auth["Identity Broker Interface<br/>(authProvider.js)"]
        P_ATProto["ATProto Agent & DID:PLC<br/>(atprotoProvider.js)"]
        P_Web3["NFT & Web3 SIWE Interface<br/>(web3NftProvider.js)"]
        P_Market["Validation Market Registry<br/>(validationMarket.js)"]
        P_DAO["Epistemic DAO Governance Registry<br/>(daoRegistry.js)"]
        P_Settle["Courtroom Settlement Protocol<br/>(courtroomSettlement.js)"]
    end

    subgraph LayerApp ["Unified Social Application (mrtingalingling/clearCloud)"]
        A_Feed["The Feed & Relational Circles (Feature 1.1)"]
        A_Grounded["Groundedness Index & Hidden Reputation"]
        A_Court["The Courtroom Deliberation Forum (Feature 1.3)"]
        A_Overlay["Social Overlays (X, Bluesky, Reddit)"]
    end

    Layer0 -->|"Supplies local AI, PII scrubber & attestations"| LayerApp
    Layer0 -->|"Supplies verified attestations"| LayerProtocol
    LayerProtocol -->|"Provides ATProto Auth & Staking Settlement Protocol"| LayerApp
```

---

## 2. Core Protocol Subsystems

### 2.1 Identity Subsystem (`src/identity/`)
- **ATProto Provider (`atprotoProvider.js`)**: Real BskyAgent integration, DID:PLC directory resolution, and session management.
- **Web3 NFT Provider (`web3NftProvider.js`)**: EIP-4361 SIWE challenge generation, W3C DID:PKH resolution, and NFT token-gate verification.
- **Unified Factory (`index.js`)**: `createAuthProvider(type, options)`.

### 2.2 Validation Market Subsystem (`src/market/`)
- **Prediction Pools (`validationMarket.js`)**: Staking pools across Vera's 4 epistemic outcomes (`VERIFIED`, `DISPUTED`, `MISINFORMED`, `NEED_CONTEXT`).
- **Dynamic Odds**: Real-time payout odds based on proportional liquidity.
- **Automated Oracle Settlement**: Payout distribution deducting protocol fees.

### 2.3 Epistemic DAO Registry Subsystem ("EnDAOsment") (`src/governance/`)
- **DAO Registry (`daoRegistry.js`)**: Proposal lifecycles, weighted voting, and quorum/consensus threshold calculation.

### 2.4 Courtroom Settlement Protocol (`src/settlement/`)
- **Cold Case Escrow (`courtroomSettlement.js`)**: Automatic 14-day inactivity settlement (**94% refunded** to depositors, **6% platform maintenance fee** retained).
- **Challenge Bond Escrow**: Anti-spam staking mechanism for retrials (overturned verdicts award bond + 50% bounty; reaffirmed verdicts forfeit bond).
- **Jury Consensus Protocol**: Evaluates 66.7% decisive consensus thresholds.
