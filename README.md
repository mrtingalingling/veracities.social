# Veracities.bet

Veracities.bet is a licensed Validation Market on ClearCloud challenge outcomes: traders bet on how the Courtroom will rule. It reads ClearCloud's public challenge and ruling records and calls [Vera](https://github.com/mrtingalingling/vera)'s public API for information only. Nothing it does feeds back into either. The product runs at veracities.bet and veracities.social; this repo holds its code.

> **Legal gate:** nothing beyond design proceeds until counsel's licensing review (B-001) signs off.

## Status

Every feature carries exactly one status: **Proposed → Confirmed → Prototyped → Audited**. Only Audited features are meant for outside users. Today nothing in this repo is Audited.

**In the prototype today (Prototyped)**

- **Four-outcome markets:** `verified`, `disputed`, `misinformed`, and `needs-context`, with odds that move with the money on each outcome.
- **Evidence rounds:** opening, evidence, cross-examination, and settlement rounds, with the option to fold.
- **Parlays and options:** multi-claim tickets, and put and call options, all subject to counsel's review.
- **Settlement:** `ValidationMarket.sol` behind a UUPS proxy, settling on M-of-N panel signatures checked by the relayer.

**Planned (Proposed in the design document)**

- **Settlement on ruling records only:** single-use nonces, a 7-day signature expiry, and appeals and second reviews keeping markets open.
- **Private conflict check:** positions held by panelists, parties, or their affiliates are voided without revealing anyone's identity.
- **The rake:** 6% of every wager plus 5% of each losing pool; cold or voided cases refund in full.
- **Rust backend:** the market, relayer, and data layer rebuilt in Rust (ADR-016).

Being removed or moved: the 5% juror fee (panelists are now paid a flat rate by ClearCloud), the 6% cold-case fee, on-chain evidence as a second settlement source, and NFT token-gating. Wallet sign-in stays, for deposits only. Governance, the Courtroom escrow, and their tables move to ClearCloud (C-012).

## Documentation

- **Veracities.bet design:** connections, settlement, fees, market mechanics, tickets, and security — [`docs/veracities.bet.md`](./docs/veracities.bet.md)
- **Ecosystem overview and ClearCloud:** in [`mrtingalingling/clearCloud`](https://github.com/mrtingalingling/clearCloud)
- **Vera:** [`mrtingalingling/vera`](https://github.com/mrtingalingling/vera)

## Getting started

```bash
npm install
docker compose up -d          # PostgreSQL 16 and Redis 7 for local development
npm run compile:contracts     # Compile Solidity contracts to src/config/contracts.json
npm run dev                   # Svelte 5 dev server on port 5174
```

Set database and Redis credentials in `.env` (`DATABASE_URL`, `REDIS_URL`); never commit them.

## Testing

```bash
npm test             # Compiles contracts, then runs the Vitest suite
npm run test:watch   # Re-run on changes
```

## Repository structure

```text
veracities.social/
├── contracts/       # ValidationMarket.sol (stays); governance and escrow contracts move to ClearCloud
├── docs/            # Veracities.bet design
├── prisma/          # Prototype database schema (replaced in the Rust rebuild)
├── scripts/         # Contract compile, deploy, and settlement relayer
├── src/
│   ├── market/      # Pools, rounds, parlays, options
│   ├── oracle/      # Relayer for panel signatures
│   ├── settlement/  # Settlement logic
│   └── components/  # Svelte 5 UI
├── tests/           # Vitest suites
└── docker-compose.yml
```
