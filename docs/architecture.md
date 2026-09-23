# veracities.social Architecture Blueprint (Layer 1.2 & 1.3)

## 1. Overview in the Vera Ecosystem

`veracities.social` hosts the **Social Truth Suite** and **The Courtroom** of the Vera decentralized truth-settlement network.

```mermaid
graph TD
    subgraph Layer0 ["Layer 0: Core Epistemic Engine (mrtingalingling/vera)"]
        V_Engine["Core Heuristics & Local AI<br/>(localAiService.js)"]
        V_Nano["On-Device AI Engine<br/>(Chrome Gemini Nano Streaming)"]
        V_P2P["Gossip Swarm Attestation<br/>(p2pNode.js)"]
    end

    subgraph Layer1_1 ["Layer 1.1: Identity & Settlement Protocol (mrtingalingling/clearCloud)"]
        C_Auth["Identity Broker Interface<br/>(authProvider.js)"]
        C_ATProto["ATProto Agent & DID:PLC<br/>(atprotoProvider.js)"]
        C_Web3["NFT & Web3 SIWE Interface<br/>(web3NftProvider.js)"]
        C_Market["Validation Market Registry<br/>(validationMarket.js)"]
        C_DAO["DAO Governance Placeholder<br/>(daoRegistry.js)"]
    end

    subgraph Layer1_2_3 ["Layer 1.2 & 1.3: Social Truth & Courtroom (mrtingalingling/veracities.social)"]
        S_PII["Private Messaging PII Scrubber<br/>(piiScrubberService.js)"]
        S_Gate["Falsifiability Gatekeeper<br/>(falsifiabilityGatekeeper.js)"]
        S_Court["Courtroom Case Manager & DAG<br/>(caseManager.js)"]
        S_Jury["Juror Engine & AI Judge<br/>(juryEngine.js)"]
        S_Feed["Groundedness Index & Hidden Rep<br/>(feedVerifier.js)"]
        S_Overlay["Social Overlays (X, Bluesky, Reddit)<br/>(overlayService.js)"]
    end

    Layer0 -->|"Supplies verified attestations & on-device AI"| Layer1_2_3
    Layer1_1 -->|"Provides ATProto / Web3 DID authentication"| Layer1_2_3
    Layer1_1 -->|"Settles disputes & stakes on-chain / via DAO"| Layer1_2_3
```

---

## 2. Core Modules

### 2.1 Layer 1.2: Private Messaging Add-on (`src/messaging/`)
- **Zero-Knowledge PII Scrubber (`piiScrubberService.js`)**:
  - Runs on-device to scrub emails, phone numbers, social handles, and financial identifiers.
  - Strips gossip preambles and conversational chatter, extracting the core falsifiable claim.
  - Generates a local preview requiring **explicit user confirmation** before any claim leaves the device.

### 2.2 Layer 1.3: The Courtroom (`src/courtroom/`)
- **Falsifiability Gatekeeper (`falsifiabilityGatekeeper.js`)**:
  - Strictly admits testable, measurable, and historical claims.
  - Screens out unprovable subjective claims, aesthetic tastes, and metaphysical beliefs with descriptive tags.
- **Case Manager (`caseManager.js`)**:
  - Dockets cases and decomposes compound claims into Directed Acyclic Graphs (DAGs) of interdependent sub-claims.
  - **14-Day Stale Cold Case Refund**: Inactive cases automatically refund **94% of wagers**, retaining a **6% protocol maintenance fee**.
  - **Challenge Bond Retrial / Appeals**: Allows cases to be reopened when fresh material evidence emerges. Overturned verdicts reward challengers with bounties; reaffirmed verdicts forfeit the bond.
- **Jury & AI Judge Engine (`juryEngine.js`)**:
  - Stake-weighted anonymous juror voting on reasoning rigor and primary documentation.
  - AI Judge acts as a judicial guardrail synthesizing consensus and filtering ad-hominem distortion.

### 2.3 Layer 1: Social Truth Suite (`src/social/`)
- **Groundedness Index ($G$) (`feedVerifier.js`)**:
  $$G = \frac{\text{Facts}}{\text{Facts} + \text{Speculation} + (3 \times \text{Falsehood})}$$
- **Asymmetric Hidden Reputation**:
  - Hidden by default to eliminate vanity gaming.
  - Slow accrual for verified facts; swift, heavy penalties for debunked posts and courtroom slashing.
  - Governs algorithmic distribution across Circle Tiers (Close Friends, Acquaintances, Network-Wide).
- **In-Feed Social Overlays (`overlayService.js`)**:
  - Real-time badge and card formatting for Bluesky, X, Reddit, and YouTube.
