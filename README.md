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

Detailed specification available in [**`docs/architecture.md`**](./docs/architecture.md).

---

## 🌟 Protocol Subsystems

1. **Identity Broker Subsystem (`src/identity/`)**:
   - ATProto (`@atproto/api` BskyAgent, `did:plc` resolution, session verification).
   - Web3 SIWE (EIP-4361, W3C `did:pkh` resolution, ERC-721 token gating placeholder).
2. **Validation Market Subsystem (`src/market/`)**:
   - Prediction market staking pools, dynamic odds, and automated settlement across Vera's 4 epistemic outcomes (`VERIFIED`, `DISPUTED`, `MISINFORMED`, `NEED_CONTEXT`).
3. **Epistemic DAO Registry Subsystem ("EnDAOsment") (`src/governance/`)**:
   - Proposal creation, weighted voting, and quorum/consensus evaluation.
4. **Courtroom Settlement Protocol (`src/settlement/`)**:
   - 14-day cold case refund distribution (**94% refunded**, **6% protocol fee** retained).
   - Challenge bond retrial escrow (50% bounty reward for overturned verdicts).
   - Decisive jury consensus tallying (66.7% threshold).

---

## 🚀 Quickstart & Testing

```bash
npm install
npm test
```
