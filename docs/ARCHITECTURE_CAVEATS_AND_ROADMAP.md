# Architecture Caveats, Vulnerability Analysis & Hardening Roadmap

> **Ecosystem Scope**: `mrtingalingling/vera`, `mrtingalingling/clearCloud`, `mrtingalingling/veracities.social`  
> **Date**: September 2026  
> **Status**: Living Architectural Specification & Production Hardening Guide  

---

## 1. Executive Summary

The Vera ecosystem partitions decentralized truth discovery and social interaction across three distinct, loosely coupled layers:
1. **`mrtingalingling/vera` (Layer 0 Engine & Privacy)**: On-device SLM reasoning (Gemini Nano / WebGPU), browser content ingestion, and zero-knowledge local PII scrubbing (Feature 1.2).
2. **`mrtingalingling/clearCloud` (Civic Social & Deliberation Application)**: Relational circles (3-tier navigation with Tier 1 rage-bait suppression), real-time Groundedness ranking ($G$), compound claim DAG decomposition, and disinterested community jury deliberation (Feature 1.1 & Feature 1.3).
3. **`mrtingalingling/veracities.social` (Protocol & Settlement Backend)**: 4-outcome Validation Prediction Markets, 14-day cold case escrow refunds (94%/6%), challenge bond retrials with 50% bounties, and decentralized identity (ATProto `did:plc` and Web3 `did:pkh`).

While the core mathematical models and separation of powers are sound, transitioning from early prototypes to battle-tested production reveals **7 key architectural caveats**. This document details each vulnerability, the attack vectors it exposes, and the engineering remediation roadmap to eliminate them.

---

## 2. In-Depth Architectural Caveats & Risk Analysis

### Caveat 1: In-Memory State vs. Distributed Persistence
* **Current State**:
  * In `clearCloud` (`FeedManager`, `CaseManager`, `JuryEngine`) and `veracities.social` (`ValidationMarket`, `CourtroomSettlementProtocol`, `DaoRegistry`), data structures are maintained in-process using native JavaScript `Map()` objects.
  * In `vera`, local chat logs and evidence chunks are persisted to browser `IndexedDB`.
* **Vulnerability & Impact**:
  * **Ephemeral State Loss**: If a server process restarts or a browser session terminates, active market wagers, open case dockets, and juror vote tallies reset to empty states.
  * **Split-Brain Desynchronization**: Multiple server instances cannot share state without a common distributed backend.
* **Remediation Roadmap**:
  * **Short-Term (Application Cache)**: Integrate a centralized, high-throughput PostgreSQL/Redis persistence layer for `clearCloud` feed caching and user profiles.
  * **Long-Term (Decentralized Immutability)**:
    * Anchor docketed claims and consensus verdicts to IPFS/Arweave content identifiers (CIDs).
    * Deploy EVM smart contracts on an Ethereum L2 (Base / Arbitrum) for escrow balances and validation pool liquidity.

---

### Caveat 2: Oracle Attestation Security & The Unsigned Verdict Risk
* **Current State**:
  * `clearCloud` Courtroom juries reach a 66.7% supermajority consensus.
  * Originally, `veracities.social` accepted plain JSON payloads to settle markets (`market.resolveMarket(caseId, verdict)`).
* **Vulnerability & Impact**:
  * **Spoofing & Pool Draining**: An adversary could forge a `{ verdict: "MISINFORMED" }` API call to settle an active prediction market in their favor and steal the liquidity pool.
  * **Replay Attacks**: Re-submitting an old verdict to settle a newly appealed retrial docket.
* **Remediation Implemented & Next Steps**:
  * ✅ **Implemented**: Built `VerdictAttestationService` in `veracities.social/src/attestation/verdictAttestation.js` featuring canonical payload hashing, HMAC-SHA256 signatures, single-use anti-replay nonces, and timestamp expiration windows.
  * **Production Target**: Transition from shared HMAC oracle secrets to **EIP-712 / Ed25519 Threshold Multi-Signatures** where the AI Judge and $M$-of-$N$ voting jurors co-sign the state transition.

---

### Caveat 3: Sybil Vulnerability, Echo-Chambers & Juror Brigading
* **Current State**:
  * Any user identity can volunteer to cast a vote in `clearCloud` Courtroom cases.
  * A hidden reputation score weights reach, but initial jury admission is open.
* **Vulnerability & Impact**:
  * **Sybil Swarms**: A coordinated actor creating 100 ATProto handles could brigaded controversial or political dockets to force an artificial 66.7% supermajority.
  * **Keynesian Beauty Contest**: Jurors vote for what they expect the crowd to vote rather than investigating empirical truth.
* **Remediation Roadmap**:
  * **Civic Sortition (Jury Duty)**: Replace open voting with algorithmic sortition. When a case is docketed, the protocol randomly summons an odd-numbered jury (e.g., 9 or 15 citizens) from a pool of vetted users with active stakes or reputation.
  * **Proof of Humanity & Staked EnDAOsment**: Juror eligibility is gated behind `veracities.social` DAO EnDAOsment (account age, Gitcoin Passport, or staked reputation).

---

### Caveat 4: Semantic Falsifiability & Adversarial Heuristic Evasion
* **Current State**:
  * `falsifiabilityGatekeeper.js` uses regular expressions (`SUBJECTIVE_INDICATORS` and `EMPIRICAL_INDICATORS`) to screen incoming cases.
* **Vulnerability & Impact**:
  * **Heuristic Bypassing**: Sophisticated users can phrase purely subjective or aesthetic statements using empirical veneer (e.g., *"Statistical polls prove Candidate A is inherently evil"*).
  * **False Positives**: Nuanced empirical claims phrased with emotional colloquialisms can be mistakenly rejected.
* **Remediation Roadmap**:
  * **Two-Tier Gatekeeper Pipeline**:
    * *Tier 1 (Fast Filter)*: Retain regex patterns for zero-latency rejection of obvious aesthetic taste ("Jazz is better than rock").
    * *Tier 2 (Local SLM Reasoner)*: Route borderline cases through Vera's on-device Gemini Nano / WebLLM pipeline using an epistemic prompt instructing the model to isolate verifiable propositions and discard rhetorical fluff.

---

### Caveat 5: Identity Dualism (ATProto DIDs vs. Web3 DIDs)
* **Current State**:
  * `clearCloud` social feeds use ATProto DIDs (`did:plc:...`).
  * `veracities.social` validation markets use Ethereum wallet addresses (`did:pkh:eip155:1:0x...`).
* **Vulnerability & Impact**:
  * **Identity Fragmentation**: Without an explicit cryptographic link, the protocol cannot know if a market bettor on `veracities.social` is sitting as a juror on that same case in `clearCloud`, breaking the conflict-of-interest firewall.
* **Remediation Roadmap**:
  * **ATProto Custom Lexicon Identity Link (`social.veracities.identity.link`)**:
    * Users sign a SIWE (Sign-In with Ethereum) message using their Web3 wallet containing their `did:plc` string.
    * The signed attestation is written to the user's ATProto repository.
    * Any address that holds an open financial position on a case is automatically recused from that case's jury ballot.

---

### Caveat 6: Cold Case Griefing & Voter Apathy Trap
* **Current State**:
  * If a case receives no activity for 14 days, it enters Cold status: 94% of bets are refunded, and 6% is retained as a protocol fee.
* **Vulnerability & Impact**:
  * **Clock-Reset Griefing**: A trader whose wager is currently in the minority could post trivial, noisy "evidence" on day 13 strictly to reset the 14-day inactivity timer and delay their financial loss.
  * **The Voter Apathy Trap**: Obscure scientific or technical claims (e.g. specialized medical trials) attract betting volume from domain specialists, but fail to attract community jurors because fact-checking requires unpaid labor.
* **Remediation Roadmap**:
  * **Substantive Evidence Threshold**: Resetting the 14-day timer requires evidence that passes a semantic relevance check by the AI Judge or requires an escalated evidence deposit.
  * **Juror Incentive Bounties**: Allocate a slice of the 6% protocol fee and market fees as a direct payout bounty to jurors who complete deliberation on verified dockets.

---

### Caveat 7: Cross-Repo Dependency Choreography
* **Current State**:
  * `clearCloud/package.json` references `@vera/core` and `veracities-social` via git references: `github:mrtingalingling/vera#main`.
* **Vulnerability & Impact**:
  * During multi-repo feature branch development, local edits in one repository are not immediately visible in dependent repositories without pushing to GitHub or manually running `npm install`.
* **Remediation Roadmap**:
  * Configure PNPM or Turborepo multi-package workspace configurations for local multi-repo development, while keeping distinct GitHub repositories for clear organizational and legal boundaries.

---

## 3. Production Hardening Roadmap & Timeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: FOUNDATION & FIREWALL (COMPLETED)                              │
│ • Separation of Powers: Deliberation in clearCloud, Markets in veracities│
│ • Svelte 5 / Vite DApps for both platforms                              │
│ • Cryptographic Oracle Attestation Bridge (VerdictAttestationService)   │
│ • 14-day cold case refund math (94%/6%) and 2x challenge retrial bonds  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: CRYPTOGRAPHIC IDENTITY & SORTITION (NEXT)                      │
│ • ATProto Lexicon `social.veracities.identity.link` (SIWE ↔ did:plc)    │
│ • Automatic Conflict-of-Interest Recusal for Bettors                    │
│ • Random Sortition (Civic Jury Duty) replacing open volunteer voting    │
│ • Gemini Nano Semantic Falsifiability Layer in Vera Cockpit             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: DECENTRALIZED MAINNET & PERSISTENCE                            │
│ • IPFS / Arweave Docket Archiving with Content Addressing               │
│ • Base / Arbitrum L2 Smart Contracts for Escrow & Market Liquidity      │
│ • EIP-712 Multi-Sig Juror Verdict Signatures                           │
│ • Juror Deliberation Fee Bounties from Protocol Maintenance Pool        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Governance & Repository Separation Matrix

| Feature Domain | Primary Repository | Consumer / Dependent | Security Boundary |
| :--- | :--- | :--- | :--- |
| **Local PII Scrubbing (1.2)** | `mrtingalingling/vera` | WhatsApp, Signal, clearCloud | Client-side only; zero network egress |
| **Groundedness Feed (1.1)** | `mrtingalingling/clearCloud` | End Users | Consumes `@vera/core` local AI |
| **Courtroom Jury (1.3)** | `mrtingalingling/clearCloud` | Civic Users | Zero financial wagering; pure evidence |
| **Validation Markets** | `mrtingalingling/veracities.social` | Speculators, Hedgers | Protocol DApp; Web3 wallet required |
| **Settlement & Escrow** | `mrtingalingling/veracities.social` | Courtroom Dockets | Enforces 14-day refunds & 2x challenge bonds |
| **Oracle Attestations** | `mrtingalingling/veracities.social` | `clearCloud` Courtroom | Cryptographically verifies signed verdicts |
