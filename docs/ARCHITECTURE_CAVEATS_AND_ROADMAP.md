# veracities.social: Architecture Caveats & Implementation Status

> **Canonical Document Reference**: The master, cross-repository architecture blueprint, deployment guide, and remaining caveats ledger is centralized in [**`vera/docs/ARCHITECTURE_CAVEATS_AND_ROADMAP.md`**](../../vera/docs/ARCHITECTURE_CAVEATS_AND_ROADMAP.md). Refer to that document for the unified ecosystem specification.
> **Repository Test Health**: **97 / 97 Vitest Tests Passing (100% Green)** across 16 test suites.

---

## 1. veracities.social Architectural Boundary (Separation of Powers)

`veracities.social` provides the **Protocol & Settlement Backend** of the Vera ecosystem. Its architectural invariants are strictly enforced:

1. **Protocol & Settlement Only**:
   - `veracities.social` handles **financial wagering, truth prediction pools, derivative hedge contracts, and on-chain DAO governance**.
   - It contains **zero judicial deliberative voting** or jury deliberation forums; all civic deliberation is isolated in `clearCloud`.
2. **Oracle Attestation Firewalls**:
   - Settlement relies on $M$-of-$N$ threshold multi-signatures from summoned jurors (`oracleRelayer.js`), validated against deterministic sortition records.
   - Attestations utilize EIP-712 structured typed data hashes with single-use nonces and 7-day expiration windows.
3. **Non-Plutocratic Governance**:
   - Epistemic DAO ("EnDAOsment") voting weight is derived from a user's multi-dimensional Epistemic Quotient ($EQ$), not token balances:
     $$EQ = 0.40 \cdot \text{Factuality} + 0.30 \cdot \text{Bridging} + 0.20 \cdot \text{SteelManning} - 0.30 \cdot \text{Toxicity}$$
   - Voter anonymity is preserved using Semaphore Zero-Knowledge proofs with single-use nullifier hashes.

---

## 2. Implemented Features & Verification Matrix

All Layer 2 and Layer 3 features required by the PRD are fully implemented in `veracities.social` and verified with **97 passing tests**:

- **Layer 2: Validation Prediction Markets (`src/market/`)**:
  - 4-outcome prediction pools (`VERIFIED`, `DISPUTED`, `MISINFORMED`, `NEED_CONTEXT`) with real-time dynamic odds.
  - 4-stage Poker Evidence Rounds (`Pre-Flop`, `Evidence Drop`, `Cross-Exam`, `Showdown`) with loss-mitigation `Fold` actions.
  - Truth Parleys Ticket Builder with compounded odds multiplication across multi-claim tickets.
  - Epistemic Put & Call derivative hedge options (Black-Scholes based downside protection and conviction leverage).
  - Losing pool slashing waterfall (15% whistleblower bounty, 5% juror fee, 5% protocol fee).
- **Settlement & Oracles (`src/settlement/`, `src/attestation/`, `src/oracle/`)**:
  - 14-day cold case refund protocol (**94% refunded** to depositors, **6% platform maintenance fee** retained).
  - Challenge bond retrial escrow (50% bounty reward for overturned verdicts).
  - $M$-of-$N$ EIP-712 threshold multi-signature oracle verification (`oracleRelayer.js`).
- **Layer 3: Epistemic DAO & ZK Ballots (`src/governance/`, `src/components/GovernanceView.svelte`)**:
  - Epistemic Passport inspection with quadratic tier multipliers (Novice: 1, Contributor: 5, Arbiter: 15, Sage Elder: 30).
  - Two-Stage Governance adapted to the EnDAOsment Framework (`GovernorGeneral` + `EpistemicCrsManager`): Stage 1 Epistemic Approval Vetting + Stage 2 Quadratic Voting with credit budgets ($V = \lfloor\sqrt{C}\rfloor$).
  - Proposal creation, quorum progress meter, and client-side Semaphore ZK anonymous ballot flow.
- **EVM Smart Contracts & Upgradeability (`contracts/`, `contracts/proxy/`)**:
  - `ValidationMarket.sol`: Core prediction market and slashing contract with EIP-712 oracle settlement and UUPS upgradeability (`UUPSUpgradeable`).
  - `CourtroomEscrow.sol`: Cold case 14-day refunds and retrial challenge bonds with UUPS proxy support.
  - `EpistemicGovernor.sol`: Quadratic tier-weighted Semaphore ZK governance contract with modular external DAO protocol interfaces (`IGovernorStandard`, `IZodiacModule`, `IAragonPlugin`, `IEnDAOsmentGovernorGeneral`).
  - `ERC1967Proxy.sol`: Production standard ERC-1967 proxy contracts enabling zero-downtime implementation upgrades with isolated storage gaps.
  - All contracts compiled with Solc 0.8.20 optimizer (200 runs) with artifacts exported to `src/config/contracts.json`.
- **Identity & Storage (`src/identity/`, `src/storage/`, `src/db/`)**:
  - ATProto Agent (`@atproto/api`), DID:PLC directory resolution, and custom Lexicons (`social.veracities.*`).
  - Web3 SIWE EIP-4361 cryptographic wallet challenge signing (`siweLink.js`).
  - Pluggable decentralized storage adapter hot-swapping IPFS CIDv1 and Arweave.
  - PostgreSQL schema definitions (`database.js`) and real-time Redis pub/sub channels (`redisPubSub.js`).

---

## 3. EnDAOsment Framework Integration: Mechanics & Upgrade Dynamics

`veracities.social` adapts the [**`DAO-Smart-Contract-Framework`**](https://github.com/mrtingalingling/DAO-Smart-Contract-Framework) for non-plutocratic Layer 3 governance:

### 3.1 How We Leverage the Framework
1. **Checkpointed Epistemic CRS (`contracts/EpistemicCrsManager.sol`)**:
   - Implemented and maintained directly within `veracities.social` (keeping the upstream `DAO-Smart-Contract-Framework` untouched).
   - Implements `ICrsManager` using historical block-level snapshots, mapping Epistemic Tiers into snapshotted voting power and credit budgets (Novice: 100, Contributor: 500, Arbiter: 1,500, Sage Elder: 3,000 credits).
   - Historical block-level checkpoints (`getPastCrs`) prevent flash-loan attacks and retroactive reputation manipulation.
2. **Two-Stage Deliberation Pipeline**:
   - **Stage 1 (Epistemic Approval Vetting)**: Proposals are vetted by high-tier Sages and Arbiters via `ApprovalGovernor.sol` based on qualitative truth and platform safety merits.
   - **Stage 2 (Quadratic Voting with Credit Budgets)**: Citizens allocate credits ($C$) where voting weight scales quadratically as $V = \lfloor\sqrt{C}\rfloor$ ($C = V^2$) via `QuadraticGovernor.sol`.
3. **Safe Timelock Execution**: Succeeded proposals queue into `TimelockController` (24–48h delay) for transparent verification before on-chain execution.
4. **Semaphore ZK Privacy Bridge**: Client-side zero-knowledge proofs preserve voter anonymity while forwarding execution to `GovernorGeneral.sol`.

### 3.2 What Happens if the Framework Updates
1. **Zero Data Loss via UUPS Storage Decoupling**: All contracts run behind independent ERC-1967 proxies with reserved storage gaps (`uint256[45..48] private __gap;`). Upgrading framework logic via `upgradeToAndCall` does not modify or delete member reputation checkpoints or proposal histories.
2. **Backward-Compatible vs. Breaking Interface Evolution**:
   - Non-breaking updates (optimizations, internal bug fixes) operate seamlessly over existing ABIs.
   - Breaking interface changes can be dynamically reconfigured via `configureParentDAO(ParentFramework.ENDAOSMENT, newAddress)` or adapted via a zero-downtime UUPS proxy upgrade on `EpistemicGovernor.sol`.
3. **Autonomous Epistemic Heuristics**: The multi-dimensional Epistemic Quotient ($EQ$) formula and credit scaling reside entirely within Vera's `contracts/EpistemicCrsManager.sol` (within `veracities.social`), ensuring Vera's reputation rules remain independent of upstream framework updates.
4. **Modular Fallback Redundancy**: If the framework pauses or fails, `EpistemicGovernor.sol` falls back to standalone execution or alternative adapters (`IGovernorStandard`, `IZodiacModule`, `IAragonPlugin`).

---

## 4. veracities.social Specific Operational Steps for Production

1. **Hosted Database & Redis Configuration**:
   - Provision a PostgreSQL database and a Redis instance, then supply credentials in `.env`:
     ```env
     DATABASE_URL="postgresql://user:password@host/veracities?sslmode=require"
     REDIS_URL="rediss://default:password@host:6379"
     ```
2. **Mainnet / Testnet Contract Deployment**:
   - Broadcast deployment transactions to Base Sepolia or Arbitrum:
     ```bash
     RPC_URL="https://sepolia.base.org" PRIVATE_KEY="0x..." node scripts/deployContracts.js --network base-sepolia
     ```
   - This automatically writes contract addresses to `src/config/contracts.json`.
3. **ATProto Lexicon Registration**:
   - Publish the `social.veracities.*` lexicons to the public ATProto registry.

---

## 5. Local Execution & Testing

```bash
# Run unit and integration tests (16 suites, 97 tests)
npm test

# Compile Solidity smart contracts
npm run compile:contracts

# Start local development server (port 5174)
npm run dev

# Build production bundle
npm run build
```
