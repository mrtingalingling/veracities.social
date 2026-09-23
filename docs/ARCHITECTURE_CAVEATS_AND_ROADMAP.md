# Architecture Caveats, Vulnerability Analysis & Future Implementation Roadmap

> **Ecosystem Scope**: `mrtingalingling/vera`, `mrtingalingling/clearCloud`, `mrtingalingling/veracities.social`  
> **Date**: September 2026  
> **Version**: 2.0 (Post-Blind Trials, Civic Sortition & Slashed Pool Bounty Sprint)  
> **Status**: Living Architectural Specification, Security Audit & Future Engineering Backlog  
> **Estate Test Suite**: 118 / 118 Passing Across All Repositories  

---

## 1. Executive Summary & Architecture Evolution

The Vera ecosystem partitions decentralized truth discovery, social discourse, and market incentives across three decoupled layers:
1. **`mrtingalingling/vera` (Layer 0 Engine & Privacy)**: On-device SLM reasoning (Gemini Nano / WebGPU), browser content ingestion, and zero-knowledge local PII scrubbing (Feature 1.2).
2. **`mrtingalingling/clearCloud` (Civic Social & Deliberation Application)**: Relational circles (3-tier navigation with Tier 1 rage-bait suppression), real-time Groundedness ranking ($G$), compound claim DAG decomposition, Blind Trial proposition abstraction, and disinterested civic jury sortition (Feature 1.1 & Feature 1.3).
3. **`mrtingalingling/veracities.social` (Protocol & Settlement Backend)**: 4-outcome Validation Prediction Markets, losing stake slashing waterfall (15% Whistleblower Evidence Bounties, 5% Juror Deliberation Fees), 14-day cold case escrow refunds (94%/6%), challenge bond retrials with 50% bounties, cryptographic oracle verdict attestations, and cross-protocol identity linkage (ATProto `did:plc` $\leftrightarrow$ Web3 `did:pkh`).

While foundational economic, cryptographic, and game-theoretic firewalls have been erected and verified, productionizing the ecosystem surfaces **8 critical architectural caveats**. 

This document provides a clear, exhaustive ledger of:
1. **What has been built and resolved so far**
2. **What caveats are left to be addressed in the future** (and their residual attack vectors)
3. **What concrete features, smart contracts, and persistence layers are left to implement**

---

## 2. Caveats Status & Future Implementation Matrix

| Caveat / Area | Current Status | Implemented Mitigations | Residual Vulnerability / Risk | Future Implementation Required | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. In-Memory State vs. Persistence** | 🔴 **OPEN** | In-memory `Map()` with unit test coverage; `vera` has IndexedDB for local chat | Server restart wipes all open cases, active bets, and jury tallies | PostgreSQL + Prisma DB, Redis pub/sub, IPFS CIDs, EVM L2 contracts | **P0 (Critical)** |
| **2. Oracle Attestation Multi-Sig** | 🟡 **PARTIALLY MITIGATED** | `VerdictAttestationService` with HMAC-SHA256, canonical hashing, nonces, 7-day TTL | Single shared secret key; compromised secret allows arbitrary market drainage | $M$-of-$N$ EIP-712 / Ed25519 threshold signatures from summoned jurors | **P0 (Critical)** |
| **3. Sybil Attacks & Juror Brigading** | 🟡 **SUBSTANTIALLY MITIGATED** | `sortitionEngine.js` summons 7-9 randomized jurors; `blindTrialEngine.js` strips bias | Sybil attacker can flood the registry with 10,000 burner DIDs to dominate sortition | Proof of Humanity (Gitcoin Passport, WorldID) + Staked DAO EnDAOsment | **P1 (High)** |
| **4. Semantic Falsifiability Evasion** | 🟡 **PARTIALLY MITIGATED** | Heuristic regex filter + spatio-temporal mutual exclusivity proof in `blindTrialEngine` | Sophisticated subjective claims phrased with empirical jargon bypass regex | Two-tier gatekeeper: On-device Gemini Nano SLM reasoning + falsifiability challenge staking | **P1 (High)** |
| **5. Identity Dualism & Recusal** | 🟡 **PARTIALLY MITIGATED** | `identityLinkService.js` links `did:plc` to `did:pkh` & recuses bettors from jury | Links are maintained in memory; lacks on-chain cryptographic binding | Custom ATProto Lexicon `social.veracities.identity.link` + EIP-4361 (SIWE) signatures | **P1 (High)** |
| **6. Cold Case Griefing & Voter Apathy** | 🟡 **PARTIALLY MITIGATED** | 15% Evidence Bounty + 5% Juror Fee from losing pool; 14-day cold case refund | Adversary can post trivial spam on day 13 to delay pool settlement | Substantive evidence threshold (enforcing CID/DOI + AI relevance gate) | **P2 (Medium)** |
| **7. Multi-Repo Choreography Drift** | 🔴 **OPEN** | Git-based dependencies in `package.json`; manual branch synchronization | Submodule drift and local link desync during concurrent multi-repo development | Turborepo / pnpm workspace monorepo tooling + published npm packages | **P2 (Medium)** |
| **8. Blind Trial Context Leakage** | 🟡 **NEWLY IDENTIFIED** | Entity masking (`[Entity_A]`) & emotional rhetoric scrubbing | High-profile / breaking news claims can be trivially de-anonymized by unique facts | Deep semantic de-contextualization + temporal embargo buffer + decoy cases | **P2 (Medium)** |

---

## 3. Deep-Dive: What Was Implemented vs. What Remains to Address

---

### Caveat 1: In-Memory State vs. Distributed Persistence
* **Current Implementation**:
  * In `clearCloud` (`FeedManager`, `CaseManager`, `JuryEngine`, `BlindTrialEngine`, `SortitionEngine`), all data structures live in Node.js process memory via JavaScript `Map()` objects.
  * In `veracities.social` (`ValidationMarket`, `CourtroomSettlementProtocol`, `IdentityLinkService`, `DaoRegistry`), prediction pools, stakes, and identity links live in Node.js process memory.
  * In `vera`, evidence chunks and chat histories are saved locally in browser `IndexedDB`.
* **Residual Risk**:
  * **Ephemeral State Loss**: Any container restart, crash, or deployment immediately erases all open prediction pools, user wagers, case dockets, and active jury summons.
  * **Zero Multi-Instance Scalability**: Horizontal scaling is impossible because two instances cannot share in-memory `Map`s, leading to split-brain dockets.
* **What is Left to Implement**:
  1. **Application-Tier Database**:
     * Deploy PostgreSQL with Drizzle or Prisma ORM in `clearCloud` and `veracities.social`.
     * Schema: `users`, `identities`, `posts`, `circles`, `cases`, `dag_nodes`, `jury_votes`, `markets`, `stakes`, `settlements`.
  2. **Real-Time Synchronization**:
     * Redis Pub/Sub cluster for broadcasting live Courtroom jury deliberation updates and real-time prediction market odds changes over WebSockets.
  3. **Decentralized Immutable Storage**:
     * Content-addressing via IPFS / Arweave for Courtroom dockets, evidence files, and signed attestation records.
  4. **Smart Contract Liquidity (EVM L2)**:
     * Deploy `ValidationMarket.sol` and `CourtroomEscrow.sol` on Base or Arbitrum to hold real USDC escrow balances instead of simulated ledger numbers.

---

### Caveat 2: Oracle Attestation Security & Multi-Sig Thresholds
* **Current Implementation**:
  * Built `veracities.social/src/attestation/verdictAttestation.js` and `cryptoUtils.js`.
  * Generates signed verdicts with canonical message hashing, HMAC-SHA256 signatures, single-use anti-replay nonces, and 7-day max-age timestamp validation.
  * `CourtroomView.svelte` includes a one-click export button generating this signed payload when 66.7% supermajority quorum is achieved.
* **Residual Risk**:
  * **Single Secret Compromise**: The oracle currently relies on a shared symmetric secret (`veracities_oracle_secret`). If an attacker extracts this key, they can forge attestations, settle markets in their favor, and drain pools.
  * **Single Point of Failure**: Relies on a centralized judge signature rather than decentralized juror agreement.
* **What is Left to Implement**:
  1. **Asymmetric EIP-712 Multi-Signature Scheme**:
     * Upgrade `verdictAttestation.js` from HMAC to asymmetric ECDSA (secp256k1) or Ed25519.
  2. **$M$-of-$N$ Threshold Citizen Signatures**:
     * When 7 citizen jurors are summoned by sortition and 5 agree on `MISINFORMED`, each juror's client-side browser signs the verdict hash with their private key.
     * The oracle payload requires at least 5 distinct juror signatures corresponding to the deterministic sortition panel before `ValidationMarket` accepts settlement.
  3. **Slashing & Bond Forfeiture**:
     * If an on-chain appeal demonstrates that a threshold group signed an attestably fraudulent verdict, their staked reputation/bonds are slashed.

---

### Caveat 3: Sybil Vulnerability, Echo-Chambers & Juror Brigading
* **Current Implementation**:
  * Built `clearCloud/src/courtroom/sortitionEngine.js`: Randomly and deterministically summons 7 to 9 citizen jurors per docket from registered identities.
  * Unsummoned spectator votes are tagged as informational-only and excluded from official consensus calculations.
  * Built `clearCloud/src/courtroom/blindTrialEngine.js`: Strips prejudicial emotional invective and anonymizes entities, preventing partisan tribal reactions.
* **Residual Risk**:
  * **Sybil Registry Inundation**: If creating a user account / DID is free, a well-funded attacker can register 50,000 automated burner accounts. By law of large numbers, the attacker's bot accounts will capture all 7 seats on the sortition panel.
* **What is Left to Implement**:
  1. **Proof of Humanity & Sybil Scoring**:
     * Integrate Gitcoin Passport, WorldID, or BrightID verification into identity registration.
     * Only identities with a Trust Score $> 20$ are admitted into the sortition jury pool.
  2. **Staked Civic EnDAOsment**:
     * Require jurors to lock a modest stake (e.g., 50 VERA or $10 USDC) in the `DaoRegistry` to be eligible for civic duty summons.
     * Summons selection probability is weighted by historical accuracy and Epistemic Quotient (EQ), not raw capital.

---

### Caveat 4: Semantic Falsifiability & Adversarial Heuristic Evasion
* **Current Implementation**:
  * Built `clearCloud/src/courtroom/falsifiabilityGatekeeper.js` with regex indicators screening for empirical vs. subjective claims.
  * Built `clearCloud/src/courtroom/blindTrialEngine.js` with spatio-temporal mutual exclusivity analysis that mathematically proves contradictions (e.g. golf course vs. clinic at same timestamp).
* **Residual Risk**:
  * **Adversarial Linguistic Evasion**: Sophisticated users can disguise purely subjective moralizing or aesthetic taste using empirical-sounding phrasing (e.g., *"Cognitive studies scientifically indicate that Genre X is inherently inferior to Genre Y"*).
  * **False Rejections**: Nuanced, high-value empirical claims that use colloquial phrasing can be rejected by static regex rules.
* **What is Left to Implement**:
  1. **Two-Tier Gatekeeper Pipeline**:
     * *Tier 1 (Fast Regex)*: Microsecond screening for blatant subjective phrases ("is the best", "I believe", "is ugly").
     * *Tier 2 (On-Device SLM Ingestion)*: Borderline claims are routed to Vera's local Gemini Nano / WebLLM engine with an epistemic prompt:
       `"Extract the core empirical predicate. Can this statement be proven false with physical, scientific, or timestamped documentary records? Return { isFalsifiable: boolean, predicate: string, requiredEvidenceType: string }."`
  2. **Admissibility Challenge Staking**:
     * Allow users to challenge a docket's admissibility by posting a challenge bond. If the community upholds that the claim is unfalsifiable opinion, the claim originator forfeits their initial case deposit.

---

### Caveat 5: Identity Dualism (ATProto DIDs vs. Web3 DIDs)
* **Current Implementation**:
  * Built `veracities.social/src/identity/identityLinkService.js`: Bidirectional mapping between `did:plc:...` and `0x...` addresses.
  * Wired conflict-of-interest checking into `clearCloud/src/courtroom/juryEngine.js`: If an identity holds an active wager on `market_c123`, they are automatically recused from that case's jury panel.
* **Residual Risk**:
  * **Unauthenticated In-Memory Linking**: Currently, identity links are registered via in-memory function calls without requiring a cryptographic signature from the wallet owner, allowing malicious impersonation.
  * **Off-Chain Disconnect**: Bluesky/ATProto nodes have no native knowledge of EVM wagers.
* **What is Left to Implement**:
  1. **ATProto Custom Lexicon Record (`social.veracities.identity.link`)**:
     * Publish official ATProto record lexicon defining the linked wallet schema:
       `{ "$type": "social.veracities.identity.link", "web3Address": "0x...", "proof": "0x_signature", "createdAt": "..." }`
  2. **Sign-In with Ethereum (EIP-4361 / SIWE)**:
     * In the `clearCloud` user profile settings, users click "Link Ethereum Wallet".
     * User signs a challenge: `"Authorize linking did:plc:alice to 0x1234... for Veracities Truth Markets"`.
     * The signature is published to the user's ATProto repository and verified across both platforms.

---

### Caveat 6: Cold Case Griefing & Voter Apathy Trap
* **Current Implementation**:
  * Built `courtroomSettlement.js` enforcing the 14-day inactivity countdown with 94% staker refund / 6% protocol fee distribution.
  * Built losing stake pool slashing in `validationMarket.js`:
    * **15% Evidence Bounty** paid to the whistleblower providing decisive receipts.
    * **5% Juror Deliberation Fee** split among attending civic jurors.
  * Built $2\times$ challenge bond filing to appeal cold cases with fresh evidence.
* **Residual Risk**:
  * **Clock-Reset Griefing**: A trader whose position is currently losing could submit low-quality junk evidence on day 13 strictly to reset the 14-day clock and prevent their stake from being refunded or settled.
  * **Obscure Case Apathy**: Highly technical cases (e.g. biochemical patent disputes) with small betting pools may not generate enough fee revenue to attract jurors.
* **What is Left to Implement**:
  1. **Substantive Evidence Threshold**:
     * Submitting evidence to reset the 14-day timer must include a verifiable decentralized CID/DOI and must pass a semantic relevance threshold ($>0.7$) evaluated by the AI Judge.
     * Escalating evidence bonds: each subsequent timer reset requires double the deposit of the previous one ($50 \rightarrow \$100 \rightarrow \$200$).
  2. **Community Juror Subsidy Pool**:
     * A portion of the 5% protocol fee collected from high-volume dockets is routed to a "Public Goods Deliberation Pool" that boosts the juror fees on low-volume, high-complexity scientific claims.

---

### Caveat 7: Cross-Repo Dependency Choreography
* **Current Implementation**:
  * 3 distinct GitHub repositories: `mrtingalingling/vera`, `mrtingalingling/clearCloud`, `mrtingalingling/veracities.social`.
  * `package.json` cross-references via `github:mrtingalingling/vera#main`.
  * Unit tests and builds passing in each repo (118/118 tests total).
* **Residual Risk**:
  * **Local Development Drift**: When making changes to shared protocols, developers must manually commit and push to remote GitHub branches before other repos can see updates, slowing down iteration.
  * **Version Desynchronization**: If `veracities.social` updates its attestation schema, `clearCloud` may fail if running on an older cached commit.
* **What is Left to Implement**:
  1. **Turborepo / PNPM Workspace Integration**:
     * Configure a unified root workspace config (`pnpm-workspace.yaml`) linking `/vera`, `/clearCloud`, and `/veracities.social` locally via `workspace:*` dependencies.
  2. **Automated CI/CD Cross-Repo Test Suite**:
     * GitHub Actions matrix workflow that checks out all 3 repos and executes cross-repo end-to-end integration tests on every pull request.
  3. **Official NPM Package Publishing**:
     * Publish versioned npm packages: `@veracities/protocol` and `@vera/core`.

---

### Caveat 8: Blind Trial Context Leakage & Stylometric De-Anonymization
* **Current Implementation**:
  * `blindTrialEngine.js` strips names, locations, and emotional invective.
* **Residual Risk**:
  * **Contextual Uniqueness**: In breaking global news or highly publicized controversies (e.g., *"The eccentric billionaire CEO of the leading electric car company who bought the bird social network"*), replacing the name with `[Entity_A]` does not prevent jurors from immediately recognizing the subject.
  * **Stylometric Fingerprinting**: The unique phrasing, typos, or syntax of a viral tweet can allow jurors to recognize the real-world post.
* **What is Left to Implement**:
  1. **Deep Semantic Paraphrasing**:
     * Route claims through an LLM instructed to rewrite the factual assertion into generalized formal symbolic logic, stripping unique idiosyncrasies.
  2. **Temporal Cooling-Off Buffer**:
     * Hold hyper-viral social claims in an escrow quarantine for 48–72 hours until the breaking news hype cycle cools before summoning the sortition panel.
  3. **Synthetic Decoy Dockets**:
     * Interleave real dockets with synthetically generated dummy cases to ensure jurors evaluate evidence strictly on merit without knowing if a case is high-stakes.

---

## 4. Master Future Implementation Roadmap: Phased Delivery

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: FOUNDATION & FIREWALL (COMPLETED)                              │
│ • Separation of Powers: Deliberation in clearCloud, Markets in veracities│
│ • Svelte 5 / Vite DApps for both platforms (26 + 31 tests)              │
│ • Blind Trial Proposition Abstractor & Prejudicial Rhetoric Scrubbing   │
│ • Algorithmic Civic Sortition Summons (7-9 randomized jurors)           │
│ • Losing Stake Slashing Waterfall (15% Evidence Bounty, 5% Juror Fee)   │
│ • Cross-Protocol Identity Linkage & Bettor Recusal Firewall             │
│ • Cryptographic Oracle Attestation Bridge (VerdictAttestationService)   │
│ • 14-day cold case refund math (94%/6%) and 2x challenge retrial bonds  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: PRODUCTION PERSISTENCE & IDENTITY INFRASTRUCTURE (NEXT SPRINT) │
│ • PostgreSQL + Prisma/Drizzle Database Layer for clearCloud & veracities│
│ • Redis Pub/Sub for live WebSocket Courtroom & Market odds sync         │
│ • ATProto Lexicon `social.veracities.identity.link` record schema       │
│ • EIP-4361 Sign-In with Ethereum (SIWE) cryptographic wallet linking    │
│ • Two-Tier Gatekeeper: Gemini Nano SLM for subtle subjective screening  │
│ • Turborepo / PNPM workspace monorepo tooling                           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: ON-CHAIN SMART CONTRACTS & MULTI-SIG ORACLES                   │
│ • Base / Arbitrum L2 Smart Contracts (ValidationMarket.sol, Escrow.sol) │
│ • $M$-of-$N$ Threshold Citizen Signatures (EIP-712 / Ed25519)           │
│ • Proof of Humanity / Sybil-Resistant Staked EnDAOsment for Sortition   │
│ • IPFS / Arweave Content-Addressed Docket & Evidence Archival           │
│ • Anti-Griefing Substantive Evidence Gates & Escalating Timers          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: LAYER 3 EPISTEMIC DAO & ZK-SNARK GOVERNANCE                    │
│ • Semaphore / Circom ZK-SNARK Private Reputation Provers                │
│ • Epistemic Quotient (EQ) Cross-Faction Bridging Metrics                │
│ • Decoupled Anonymous DAO Treasury & Parameter Governance               │
│ • Mobile Apps (iOS/Android) & Cross-Platform Extension Distribution     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Concrete Engineering Task Backlog (Sprint Ready)

### Sprint 1: Production Persistence & Database Layer (Phase 2)
- [ ] **Task 2.1**: Initialize PostgreSQL schema in `clearCloud` using Drizzle ORM (`schema.ts`).
  * *Tables*: `users`, `circles`, `posts`, `cases`, `dag_nodes`, `jury_votes`.
- [ ] **Task 2.2**: Initialize PostgreSQL schema in `veracities.social` using Drizzle ORM.
  * *Tables*: `markets`, `stakes`, `settlements`, `evidence_bounties`, `identity_links`.
- [ ] **Task 2.3**: Deploy Redis container and implement WebSocket event bus for live consensus and odds updates.
- [ ] **Task 2.4**: Replace in-memory `Map`s with database queries with connection pooling.

### Sprint 2: Cryptographic Identity & ATProto Lexicon (Phase 2)
- [ ] **Task 2.5**: Define and publish ATProto Lexicon `social.veracities.identity.link`.
- [ ] **Task 2.6**: Build EIP-4361 SIWE modal in `clearCloud` settings for linking Web3 wallets with MetaMask/Rainbow.
- [ ] **Task 2.7**: Connect `identityLinkService` to read published ATProto repository records.

### Sprint 3: Local SLM Semantic Gatekeeper (Phase 2)
- [ ] **Task 2.8**: Integrate WebGPU Gemini Nano pipeline in `clearCloud` for Tier-2 falsifiability validation.
- [ ] **Task 2.9**: Build automated unit tests testing adversarial subjective evasion vs. Gemini Nano.

### Sprint 4: Smart Contracts & Multi-Sig Oracle (Phase 3)
- [ ] **Task 3.1**: Write `ValidationMarket.sol` (Foundry / Solidity) implementing the losing pool slashing waterfall:
  * 15% Whistleblower Bounty, 5% Juror Deliberation Fee, 5% Protocol Fee, 75% Net Profit.
- [ ] **Task 3.2**: Write `CourtroomEscrow.sol` for 14-day cold case refunds and challenge bonds.
- [ ] **Task 3.3**: Implement EIP-712 client-side signing in `CourtroomView.svelte` for summoned jurors.
- [ ] **Task 3.4**: Integrate IPFS pinning service (Helia / Pinata) for permanent docket receipts.

---

## 6. Architecture & Security Boundary Summary

```
                      ┌──────────────────────────────────────────────┐
                      │              CLIENT BROWSER                  │
                      │  (Zero-Egress Client-Side PII Scrubbing)     │
                      └───────┬──────────────────────────────┬───────┘
                              │                              │
         ATProto Feed &       │                              │ Web3 Wagers &
         Civic Deliberation   │                              │ Slashed Bounties
                              ▼                              ▼
             ┌────────────────────────────────┐   ┌────────────────────────────────┐
             │          clearCloud            │   │       veracities.social        │
             │   (Unified Social App)         │   │   (Protocol & Settlement)      │
             ├────────────────────────────────┤   ├────────────────────────────────┤
             │ • 3-Tier Relational Feed       │   │ • 4-Outcome Validation Markets │
             │ • Blind Trial Proposition Card │   │ • 15% Evidence Bounty Slashing │
             │ • Civic Duty Sortition Panel   │   │ • 5% Juror Deliberation Fee    │
             │ • Conflict Recusal Firewall    │   │ • 14-Day Cold Case Escrow Vault│
             │ • DAG Claim Decomposition      │   │ • EIP-712 Oracle Bridge        │
             └────────────────┬───────────────┘   └────────────────┬───────────────┘
                              │                                    │
                              │       Cryptographic Oracle         │
                              └─────────── Attestation ────────────┘
```

The division between **evidence-based civic deliberation** (`clearCloud`) and **capital-at-risk truth wagering** (`veracities.social`) guarantees that financial speculators cannot purchase courtroom verdicts, while truth-seeking whistleblowers who uncover definitive empirical evidence are handsomely rewarded from the losing pool.
