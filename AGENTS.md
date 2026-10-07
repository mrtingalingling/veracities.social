# Agent Instructions (Veracities.bet)

These instructions apply to every coding agent working in this repo. `AGENTS.md` and `GEMINI.md` are identical copies for different agent tools, so update both together.

## Source of truth

[`docs/veracities.bet.md`](./docs/veracities.bet.md) for Veracities.bet; cross-product rules are in `docs/ecosystem.md` in the `clearCloud` repo. Read the relevant sections before any ticket. Ticket IDs here are B-001 to B-004.

## Product boundaries (shared across Vera, ClearCloud, and Veracities.bet)

From ADR-001:

- **`vera`**: a standalone AI verification agent: pipeline, public API, SDK, web components, and the Chrome extension. **NEVER make Vera depend on ClearCloud or Veracities.bet**, and never let a wager, ruling, or market outcome feed back into a Vera verdict (ADR-010).
- **`clearCloud`**: the social network, the Courtroom (challenges, panels, rulings), probation, and DAO governance. **NEVER add wagers to ClearCloud**; its only outcome-linked money is the refund-or-forfeit probation bond (ADR-011).
- **`veracities.social`**: the Veracities.bet Validation Market only: markets on ruling outcomes, settlement, and the rake. **NEVER add panels, juries, or governance to veracities.social.**
- Products integrate only through Vera's public SDK and API and public protocol records, never private databases or internal calls.

## This repo

- **Legal gate:** no build work beyond design until counsel's review (B-001) says go. Tickets before then are specs and prototypes only.
- **Frontend:** Svelte 5 runes only (`$state`, `$derived`, `$derived.by`, `$effect`, `$props`); never legacy stores or `$:` declarations.
- **Backend:** new server-side code is Rust by default (ADR-016, ticket B-004); the prototype's JavaScript services and Prisma models are replaced, not extended.
- **Settlement:** markets settle only on signed ruling records, with single-use nonces and a 7-day expiry. Never use a Vera verdict as a settlement input (ADR-010).
- **Conflicts:** void positions held by panelists, parties, and their affiliates through per-case conflict codes; never learn or store anyone's ClearCloud persona.
- **Contracts:** `ValidationMarket.sol` stays here: Solidity ^0.8.20, optimizer on, re-entrancy guards on every fund-moving function, the same upgrade rules as ClearCloud's contracts, and the EIP-712 domain `veracities.social`. Recompile with `npm run compile:contracts` after any Solidity change.
- **Secrets:** database and Redis credentials come from `.env`; never commit them.

## 🎫 Ticket Execution Rules (all coding agents)

These rules are written for Gemini 3.8 Flash as the baseline, so any ticket, including one assigned to Claude Opus 5.5, can be finished safely by Gemini if Opus isn't available. Every other model follows them too. They exist because a model that drifts out of scope or guesses produces diffs no one can review.

### 1. Before writing any code

1. **One ticket per session.** Read the ticket's row in [`docs/veracities.bet.md`](./docs/veracities.bet.md) (ticket, acceptance criteria, model, reviewer, dependencies) and every section, ADR, and endpoint it cites. Re-read them when the session resumes; don't rely on memory of an earlier session.
2. **Check dependencies.** If any ticket in "Depends on" isn't merged, stop and report it.
3. **Write a plan and wait.** Post a short plan before editing anything:
   - each acceptance criterion as a checkbox, with the test that will prove it
   - every file you expect to touch, and why
   - for any branching logic, the truth table you'll implement
   - anything unclear or in conflict with the design set, phrased as a question

   Don't start until a human (or the ticket's reviewer) approves the plan. If the plan needs more than about ten files or 400 changed lines, propose splitting the ticket instead.
4. **Never guess.** If a criterion, name, or behavior isn't in the design set, ask. "The design doesn't say" is a valid answer to report; inventing an answer isn't.

### 2. Scope

- Touch only the files in the approved plan. If you discover you need another file, stop and update the plan first.
- No renames, reformatting, dependency upgrades, or "while I'm here" fixes. Note unrelated problems in the PR description instead.
- Never invent features, endpoints, config keys, statuses, or verdict values that aren't in the design set. The four outcomes, the rake, settlement rules, and status vocabulary in `docs/veracities.bet.md` are fixed unless an ADR changes them.
- Never change which AI model the code calls, and never add a dependency, unless the ticket says so.

### 3. Making the change

- Follow the reviewable-diffs skill in `.agents/skills/reviewable-diffs/`: minimal diff, the truth table from the plan, and a test for each acceptance criterion.
- Work in small steps: change, run the relevant tests, then continue. Don't stack several untested changes.
- Never print, log, or echo keys, tokens, or personal data, including in tests, fixtures, and debug output.
- Never disable, skip, or weaken a failing test to make it pass. Report it instead.

### 4. Finishing

- Run the repo's tests (`npm test`, which compiles the contracts first; start PostgreSQL and Redis with `docker compose up -d` for integration tests) and fix failures your change caused.
- Open a PR whose description includes: each acceptance criterion mapped to the test that proves it; the files changed; anything left undone or uncertain; and which model wrote it.
- Don't mark the ticket done; the reviewer does.

### 5. Extra rules when Gemini 3.8 Flash takes a Claude Opus 5.5 ticket

Opus tickets are the schema, security, and cross-cutting ones, where a wrong choice is expensive to undo. When Gemini finishes one:

- Use **high** thinking for the whole ticket.
- The plan must also list which ADRs the change touches and confirm it follows each one. Any change to a schema, a public API shape, a signature format, or a security boundary needs explicit human approval before coding, even if it seems implied.
- Split the work into the smallest mergeable PRs, each with its own tests.
- The reviewer must be a human, never Gemini reviewing its own model's work. Tickets whose listed reviewer is Claude Opus 5.5 also fall back to a human reviewer while Opus is unavailable.
- Note "Opus ticket, completed by Gemini 3.8 Flash" at the top of the PR.

### 6. Model notes

- **Gemini 3.8 Flash:** high thinking for reviews, security work, and Opus tickets; medium for routine implementation (minimal isn't supported). If it proposes a broader refactor than the ticket asks for, reject it and restate the scope. As a reviewer, it reports pass or fail for each acceptance criterion, citing the line in the diff, rather than general impressions.
- **Qwen3.8-27B (local, MLX):** one file, the exact function or lines to change, and the expected result; ask for a unified diff only, with a low temperature (0 to 0.2). If the change needs more than one file or any design judgment, hand the ticket back for reassignment. Its tickets are reviewed by Gemini 3.8 Flash or a human.
- **Documentation tickets** go to Claude Opus 5.5 or a human only, and never fall back to Gemini 3.8 Flash or Qwen.
