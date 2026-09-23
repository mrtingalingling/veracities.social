import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationMarket, OUTCOMES, ROUNDS, POKER_ACTIONS } from '../src/market/validationMarket.js';

describe('Layer 2 Poker-Style Evidence Rounds & Fold Mechanics', () => {
  let marketService;
  let market1;
  let market2;

  beforeEach(() => {
    marketService = new ValidationMarket();
    market1 = marketService.createMarket({
      claimId: 'claim_climate_2024',
      claimText: 'Atmospheric CO2 reached 420 ppm benchmark in 2024.',
      creatorDid: 'did:plc:alice_climate',
      initialBounty: 200
    });
    market2 = marketService.createMarket({
      claimId: 'claim_mars_ice',
      claimText: 'Subsurface brines detected on Mars by radar.',
      creatorDid: 'did:plc:bob_space',
      initialBounty: 100
    });
  });

  describe('Round Progression State Machine (PRD §5.2)', () => {
    it('initializes in PRE_FLOP round', () => {
      expect(market1.currentRound).toBe(ROUNDS.PRE_FLOP);
      expect(market1.roundIndex).toBe(0);
    });

    it('progresses sequentially: PRE_FLOP -> EVIDENCE_DROP -> CROSS_EXAM -> SHOWDOWN', () => {
      const r1 = marketService.advanceRound(market1.marketId);
      expect(r1.currentRound).toBe(ROUNDS.EVIDENCE_DROP);
      expect(market1.currentRound).toBe(ROUNDS.EVIDENCE_DROP);

      const r2 = marketService.advanceRound(market1.marketId);
      expect(r2.currentRound).toBe(ROUNDS.CROSS_EXAM);

      const r3 = marketService.advanceRound(market1.marketId);
      expect(r3.currentRound).toBe(ROUNDS.SHOWDOWN);

      expect(() => marketService.advanceRound(market1.marketId)).toThrow(
        'Market is already at final round (SHOWDOWN)'
      );
    });

    it('rejects round advancement for settled markets', () => {
      marketService.settleMarket(market1.marketId, OUTCOMES.VERIFIED);
      expect(() => marketService.advanceRound(market1.marketId)).toThrow(
        'Cannot advance round for market with status: SETTLED'
      );
    });
  });

  describe('Poker Actions: Check, Bet, Call, Raise', () => {
    it('allows a staker to CHECK in PRE_FLOP', () => {
      const action = marketService.executePokerAction({
        marketId: market1.marketId,
        stakerDid: 'did:pkh:0xJuror1',
        action: POKER_ACTIONS.CHECK
      });

      expect(action.action).toBe(POKER_ACTIONS.CHECK);
      expect(action.round).toBe(ROUNDS.PRE_FLOP);
      expect(market1.roundWagers[ROUNDS.PRE_FLOP].length).toBe(1);
    });

    it('places stakes on BET/CALL and increases pool totals', () => {
      const initialPool = market1.totalPool;
      const betReceipt = marketService.executePokerAction({
        marketId: market1.marketId,
        stakerDid: 'did:pkh:0xAlice',
        action: POKER_ACTIONS.BET,
        outcome: OUTCOMES.VERIFIED,
        amount: 150
      });

      expect(betReceipt.action).toBe(POKER_ACTIONS.BET);
      expect(betReceipt.amount).toBe(150);
      expect(market1.totalPool).toBe(initialPool + 150);
      expect(market1.outcomePools[OUTCOMES.VERIFIED]).toBe(150);
    });

    it('allows RAISE in subsequent evidence rounds', () => {
      marketService.advanceRound(market1.marketId); // to EVIDENCE_DROP

      const raiseReceipt = marketService.executePokerAction({
        marketId: market1.marketId,
        stakerDid: 'did:pkh:0xBob',
        action: POKER_ACTIONS.RAISE,
        outcome: OUTCOMES.MISINFORMED,
        amount: 300
      });

      expect(raiseReceipt.action).toBe(POKER_ACTIONS.RAISE);
      expect(raiseReceipt.round).toBe(ROUNDS.EVIDENCE_DROP);
      expect(market1.outcomePools[OUTCOMES.MISINFORMED]).toBe(300);
    });

    it('prohibits new bets or raises during SHOWDOWN', () => {
      marketService.advanceRound(market1.marketId); // EVIDENCE_DROP
      marketService.advanceRound(market1.marketId); // CROSS_EXAM
      marketService.advanceRound(market1.marketId); // SHOWDOWN

      expect(() => {
        marketService.executePokerAction({
          marketId: market1.marketId,
          stakerDid: 'did:pkh:0xLateComer',
          action: POKER_ACTIONS.BET,
          outcome: OUTCOMES.VERIFIED,
          amount: 50
        });
      }).toThrow('Market is in SHOWDOWN round; bets are locked awaiting jury verdict');
    });
  });

  describe('Risk-Mitigation FOLD Mechanism (PRD §5.2)', () => {
    it('allows a staker to FOLD, forfeiting prior bets but mitigating future loss', () => {
      // Alice bets $100 on VERIFIED in PRE_FLOP
      marketService.executePokerAction({
        marketId: market1.marketId,
        stakerDid: 'did:pkh:0xAlice',
        action: POKER_ACTIONS.BET,
        outcome: OUTCOMES.VERIFIED,
        amount: 100
      });

      // Advance to EVIDENCE_DROP
      marketService.advanceRound(market1.marketId);

      // Opposing evidence drops. Alice folds!
      const foldReceipt = marketService.executePokerAction({
        marketId: market1.marketId,
        stakerDid: 'did:pkh:0xAlice',
        action: POKER_ACTIONS.FOLD
      });

      expect(foldReceipt.action).toBe(POKER_ACTIONS.FOLD);
      expect(foldReceipt.forfeitedAmount).toBe(100);
      expect(foldReceipt.savedFutureLiabilities).toBe(true);
      expect(market1.foldedStakers.has('did:pkh:0xAlice')).toBe(true);

      // Alice cannot perform any more actions in this market
      expect(() => {
        marketService.executePokerAction({
          marketId: market1.marketId,
          stakerDid: 'did:pkh:0xAlice',
          action: POKER_ACTIONS.RAISE,
          outcome: OUTCOMES.VERIFIED,
          amount: 50
        });
      }).toThrow('Staker did:pkh:0xAlice has already folded in this market');
    });

    it('excludes folded stakers from winning settlement payouts even if their outcome matches', () => {
      // Bob bets on VERIFIED
      marketService.placeStake({
        marketId: market1.marketId,
        stakerDid: 'did:pkh:0xBob',
        outcome: OUTCOMES.VERIFIED,
        amount: 200
      });

      // Charlie bets on VERIFIED then folds
      marketService.placeStake({
        marketId: market1.marketId,
        stakerDid: 'did:pkh:0xCharlie',
        outcome: OUTCOMES.VERIFIED,
        amount: 100
      });
      marketService.executePokerAction({
        marketId: market1.marketId,
        stakerDid: 'did:pkh:0xCharlie',
        action: POKER_ACTIONS.FOLD
      });

      // Market settles with VERIFIED
      const settlement = marketService.settleMarket(market1.marketId, OUTCOMES.VERIFIED);
      const bobPayout = settlement.payouts.find(p => p.stakerDid === 'did:pkh:0xBob');
      const charliePayout = settlement.payouts.find(p => p.stakerDid === 'did:pkh:0xCharlie');

      expect(bobPayout).toBeDefined();
      expect(bobPayout.payout).toBeGreaterThan(0);
      expect(charliePayout).toBeUndefined(); // Charlie folded, received no payout
    });
  });

  describe('Truth Parleys & Multi-Claim Wagering (PRD §5.3)', () => {
    it('creates a multi-leg parley slip and computes multiplied odds', () => {
      marketService.placeStake({ marketId: market1.marketId, stakerDid: 'did:pkh:0xPool1', outcome: OUTCOMES.VERIFIED, amount: 200 });
      marketService.placeStake({ marketId: market1.marketId, stakerDid: 'did:pkh:0xPool2', outcome: OUTCOMES.MISINFORMED, amount: 100 });
      marketService.placeStake({ marketId: market2.marketId, stakerDid: 'did:pkh:0xPool3', outcome: OUTCOMES.MISINFORMED, amount: 150 });

      const odds1 = marketService.calculateOdds(market1.marketId)[OUTCOMES.VERIFIED];
      const odds2 = marketService.calculateOdds(market2.marketId)[OUTCOMES.MISINFORMED];

      const parley = marketService.createParley({
        stakerDid: 'did:pkh:0xHighConvictionTrader',
        legs: [
          { marketId: market1.marketId, outcome: OUTCOMES.VERIFIED },
          { marketId: market2.marketId, outcome: OUTCOMES.MISINFORMED }
        ],
        stakeAmount: 50
      });

      expect(parley.parleyId).toBeDefined();
      expect(parley.legs.length).toBe(2);
      expect(parley.status).toBe('PENDING');
      expect(parley.multipliedOdds).toBe(Math.round(odds1 * odds2 * 100) / 100);
      expect(parley.potentialPayout).toBe(Math.round(50 * parley.multipliedOdds * 100) / 100);
    });

    it('rejects parley tickets with fewer than 2 legs or duplicate claims', () => {
      expect(() => {
        marketService.createParley({
          stakerDid: 'did:pkh:0xTrader',
          legs: [{ marketId: market1.marketId, outcome: OUTCOMES.VERIFIED }],
          stakeAmount: 50
        });
      }).toThrow('Parley ticket requires at least 2 distinct claim legs');

      expect(() => {
        marketService.createParley({
          stakerDid: 'did:pkh:0xTrader',
          legs: [
            { marketId: market1.marketId, outcome: OUTCOMES.VERIFIED },
            { marketId: market1.marketId, outcome: OUTCOMES.MISINFORMED }
          ],
          stakeAmount: 50
        });
      }).toThrow('Duplicate marketId');
    });

    it('settles parley as WON when all legs match settled verdicts', () => {
      marketService.placeStake({ marketId: market1.marketId, stakerDid: 'did:pkh:0xSeed1', outcome: OUTCOMES.VERIFIED, amount: 100 });
      marketService.placeStake({ marketId: market2.marketId, stakerDid: 'did:pkh:0xSeed2', outcome: OUTCOMES.MISINFORMED, amount: 100 });

      const parley = marketService.createParley({
        stakerDid: 'did:pkh:0xWinner',
        legs: [
          { marketId: market1.marketId, outcome: OUTCOMES.VERIFIED },
          { marketId: market2.marketId, outcome: OUTCOMES.MISINFORMED }
        ],
        stakeAmount: 100
      });

      // Settle market 1: parley remains PENDING
      marketService.settleMarket(market1.marketId, OUTCOMES.VERIFIED);
      marketService.evaluateParley(parley.parleyId);
      expect(parley.status).toBe('PENDING');

      // Settle market 2: parley transitions to WON
      marketService.settleMarket(market2.marketId, OUTCOMES.MISINFORMED);
      marketService.evaluateParley(parley.parleyId);
      expect(parley.status).toBe('WON');
      expect(parley.payout).toBe(parley.potentialPayout);
    });

    it('settles parley as LOST if even a single leg fails', () => {
      marketService.placeStake({ marketId: market1.marketId, stakerDid: 'did:pkh:0xSeed1', outcome: OUTCOMES.VERIFIED, amount: 100 });
      marketService.placeStake({ marketId: market2.marketId, stakerDid: 'did:pkh:0xSeed2', outcome: OUTCOMES.MISINFORMED, amount: 100 });

      const parley = marketService.createParley({
        stakerDid: 'did:pkh:0xUnlucky',
        legs: [
          { marketId: market1.marketId, outcome: OUTCOMES.VERIFIED },
          { marketId: market2.marketId, outcome: OUTCOMES.MISINFORMED }
        ],
        stakeAmount: 100
      });

      // Market 1 resolves contrary to leg
      marketService.settleMarket(market1.marketId, OUTCOMES.MISINFORMED);
      marketService.evaluateParley(parley.parleyId);

      expect(parley.status).toBe('LOST');
      expect(parley.payout).toBe(0);
    });
  });
});
