# Veracities.bet: Validation Market

Veracities.bet is a licensed wagering market on ClearCloud challenge outcomes, meaning what the Courtroom rules. It calls Vera's API and reads ClearCloud's public records; nothing it does feeds back into either.

## Brief

**Purpose.** A wagering market on challenge outcomes, meaning what the Courtroom rules, for an audience that wants it, in jurisdictions where it is licensed. It bets on rulings, not on objective truth.

**Users.** A separate, regulated market; KYC and age verification apply.

**In scope.** Markets on the outcome of a ClearCloud challenge's ruling, with the four ruling outcomes; settlement on the final ruling record; voiding conflicted positions; its wager fee; payments to ClearCloud and Vera; compliance.

**Out of scope.** Settling on Vera verdicts, live or frozen (ADR-010); Vera evidence appears only as information. Reading ClearCloud's private data.

**Gate.** Nothing beyond design proceeds before legal and licensing review (B-001), and that review can't wait for an MVP.

**Brand.** Runs at veracities.bet and veracities.social, sharing the "veracities" name with Vera's veracities.app by design. Its code lives in the veracities.social repo.

## How it connects

Veracities.bet only reads from the other two products, through public interfaces (ADR-001).

- **Vera:** calls Vera's public API as an ordinary customer at published per-call prices, to show verdicts and evidence as information. It never uses a verdict as a settlement input.
- **ClearCloud:** reads public `social.clearcloud.*` records (challenges, rulings) and reputation attestations users publish by opt-in. ClearCloud's Challenge button links into Veracities.bet, and nothing flows back.
- **Wagers sized by reputation:** stake limits can use a challenger's published reputation band; Veracities.bet never sees exact scores or which personas belong to whom. Wallet sign-in (SIWE) is kept for deposits only and is never linked publicly to a ClearCloud persona; the prototype's NFT token-gating is dropped.

## Settlement and integrity

Every market settles on one signed ruling record, and nobody who can influence that ruling may hold a position on it.

- **Settlement input:** the final ruling record for the case, verified by its signature. Appeals and second reviews keep a market open until the final ruling, and a voided case refunds all positions (Confirmed). The settlement relayer accepts a ruling's panel signatures only with single-use nonces and within 7 days of signing.
- **Conflicted positions:** positions held by a seated panelist, the poster, the challenger, or their declared affiliates are voided. The check runs at settlement against private per-case conflict codes (C-009): each bettor proves their code doesn't match a panelist's or party's, so Veracities.bet never learns who the panelists or parties are, or which personas belong to whom. Bettors therefore hold the same proof-of-personhood credential ClearCloud uses.
- **No feedback:** market prices and volumes never reach Vera or ClearCloud's ranking (ADR-010).

## Fees, payments, and ads

Veracities.bet keeps a rake of a 6% wager fee plus 5% of each losing pool and pays the other two products at fixed, published prices.

- **To ClearCloud:** data-access fees for public records, and ad spend inside ClearCloud. Both are betting-derived and go to the segregated pool, which can never fund Vera.
- **To Vera:** the normal per-call API price. Anything above Vera's cost of serving Veracities.bet, by the method in C-006, goes to the segregated pool, so Vera's income never rises with betting volume.
- **Ads in ClearCloud:** only where gambling advertising is legal, only to age-verified users who opted in, labeled as gambling ads, and never on or beside a post under challenge.

## Market mechanics

Carried over from the earlier PRD and prototype, Proposed here, and all subject to counsel's review (B-001, B-003).

- **Evidence rounds:** instead of a static binary market, positions move through rounds that follow the case: an opening round, an evidence round when primary sources are filed, a cross-examination round, and settlement on the ruling. Traders can bet, raise, call, or fold; folding after strong opposing evidence forfeits only the stakes already placed. Odds move with the money on each outcome, as a shared pool (parimutuel).
- **Outcomes:** four outcomes matching the ruling ballot (`verified`, `disputed`, `misinformed`, `needs-context`), plus full refunds with no fee when a case goes cold or is voided; the prototype's 6% cold-case fee is dropped, and 6% applies to every wager instead (Confirmed).
- **Parlays and options:** bundles of several challenges with multiplied payouts, and put and call options on ruling outcomes, priced with a Black-Scholes model in the prototype. Options are likely regulated as derivatives, separately from wagering, so counsel may drop them.
- **Currencies:** fiat on-ramps (Stripe or Wise were the earlier choices) and stablecoin deposits; USDC on Base was the prototype's default.
- **Evidence bounty:** the prototype paid 15% of the losing pool to whoever filed the evidence that decided the case. That stays only if the parties to the case and panelists are excluded from it. A further 5% of each losing pool goes to Veracities.bet, on top of the 6% wager fee; together they work like a poker rake (Confirmed).
- **Dropped:** the prototype's 5% juror fee, because panelists are now paid a flat rate by ClearCloud and have no stake in betting volume (ADR-010), and on-chain evidence attestation as a second settlement oracle, because markets settle only on ruling records.
- **Contracts:** `ValidationMarket.sol` stays here (Solidity ^0.8.20, optimizer on, re-entrancy guards on every fund-moving function, its own UUPS proxy under the same upgrade rules as ClearCloud's contracts, EIP-712 domain `veracities.social`). `CourtroomEscrow.sol`, EpistemicCrsManager.sol, EpistemicGovernor.sol, and the case, juror-vote, post, and user tables move to ClearCloud's repo (C-012). The backend (market, settlement relayer, PostgreSQL and Redis data layer) is rebuilt in Rust (ADR-016, B-004).

## Key journeys

1. **Take a position:** a trader opens a challenge's market from ClearCloud's Challenge link, passes KYC and the conflict check, and bets in the opening round.
2. **Fold after evidence:** strong opposing evidence is filed, and the trader folds before settlement, keeping the stake not yet placed.
3. **Settlement:** the panel's final ruling record is verified, conflicted positions are voided, appeals keep the market open, and winnings are credited.

## Tickets

| ID | Ticket | Acceptance criteria | Model | Reviewer | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| B-001 | Legal and licensing review | Counsel memo on jurisdictions, licensing, and KYC, covering every mechanic in B-003; go or no-go recorded | Human | Owner | — | To do |
| B-002 | Settle on ruling records and void positions held by panelists and case parties (ADR-010) | Settlement reads only signed ruling records, with single-use nonces and a 7-day expiry; positions held by a seated panelist, the poster, or the challenger are voided in tests; no Vera verdict is a settlement input | Claude Opus 5.5 | Human (security) | B-001, C-004, C-006, C-009 | To do |
| B-003 | Market mechanics spec for counsel: evidence rounds, folds, outcomes, parlays, options, currencies, evidence bounty | Each mechanic described with its money flows; counsel marks each keep, change, or drop; dropped items removed from the prototype | Human | Owner | — | To do |
| B-004 | Rust backend for the market, settlement relayer, and data layer (ADR-016) | Builds and tests in CI from a clean clone; replaces the prototype's JavaScript services and Prisma models; reads ClearCloud only through public records | Claude Opus 5.5 | Human (security) | B-001 | To do |

## Security and compliance

Veracities.bet runs its own security and compliance program, including KYC, age verification, payments, and financial-crime controls, and shares no credentials or infrastructure secrets with Vera or ClearCloud.

| Threat | Mitigation | Tickets |
| --- | --- | --- |
| Match fixing by a party or panelist | Positions of panelists, parties, and affiliates voided at settlement through private per-case conflict codes | B-002 |
| Settling on a forged or unfinished ruling | Signature check on the final ruling record; appeals extend the market | B-002 |
| Gambling ads reaching minors or unlicensed regions | Age verification, opt-in, regional limits, labeling | B-001 |
