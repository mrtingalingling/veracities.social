import { describe, it, expect } from 'vitest';
import { ValidationMarket, OUTCOMES, OPTION_TYPES } from '../src/market/validationMarket.js';

describe('Layer 2: Derivative Hedge Options Engine (PRD §5.3)', () => {
  it('creates and executes a PUT option to protect long staker from adverse evidence drop', () => {
    const marketEngine = new ValidationMarket();
    const market = marketEngine.createMarket({
      claimId: 'claim_hedge_01',
      claimText: 'Company X filed for Chapter 11 bankruptcy.',
      creatorDid: 'did:plc:creator',
      initialBounty: 100
    });

    // Staker places 200 USDC on VERIFIED
    marketEngine.placeStake({
      marketId: market.marketId,
      stakerDid: 'did:plc:trader_alice',
      outcome: OUTCOMES.VERIFIED,
      amount: 200
    });

    // Opponent places 300 USDC on MISINFORMED
    marketEngine.placeStake({
      marketId: market.marketId,
      stakerDid: 'did:plc:trader_bob',
      outcome: OUTCOMES.MISINFORMED,
      amount: 300
    });

    // Alice buys a PUT Option covering her 200 notional stake against negative resolution
    const putOption = marketEngine.purchaseHedgeOption({
      stakerDid: 'did:plc:trader_alice',
      marketId: market.marketId,
      type: OPTION_TYPES.PUT,
      targetOutcome: OUTCOMES.VERIFIED,
      notionalAmount: 200
    });

    expect(putOption.optionId).toBeDefined();
    expect(putOption.status).toBe('ACTIVE');
    expect(putOption.type).toBe('PUT');
    expect(putOption.premium).toBeGreaterThan(0);
    expect(putOption.notionalAmount).toBe(200);

    // Whistleblower drops definitive evidence proving claim is MISINFORMED
    const settlement = marketEngine.settleMarket(market.marketId, OUTCOMES.MISINFORMED);

    // The underlying stake on VERIFIED lost, BUT the PUT option exercised
    expect(settlement.settledOptions.length).toBe(1);
    const resolvedOption = settlement.settledOptions[0];
    expect(resolvedOption.status).toBe('EXERCISED');
    expect(resolvedOption.payout).toBe(200); // 200 USDC capital protected
    expect(resolvedOption.netProfit).toBe(200 - putOption.premium);
  });

  it('expires a PUT option worthless when target outcome wins', () => {
    const marketEngine = new ValidationMarket();
    const market = marketEngine.createMarket({
      claimId: 'claim_hedge_02',
      claimText: 'Atmospheric CO2 reached 420 ppm.',
      creatorDid: 'did:plc:creator',
      initialBounty: 100
    });

    marketEngine.placeStake({
      marketId: market.marketId,
      stakerDid: 'did:plc:trader_alice',
      outcome: OUTCOMES.VERIFIED,
      amount: 150
    });

    const putOption = marketEngine.purchaseHedgeOption({
      stakerDid: 'did:plc:trader_alice',
      marketId: market.marketId,
      type: OPTION_TYPES.PUT,
      targetOutcome: OUTCOMES.VERIFIED,
      notionalAmount: 150
    });

    // Market settles VERIFIED; Alice won her original stake, so the put hedge expires
    const settlement = marketEngine.settleMarket(market.marketId, OUTCOMES.VERIFIED);
    const resolvedOption = settlement.settledOptions[0];
    expect(resolvedOption.status).toBe('EXPIRED');
    expect(resolvedOption.payout).toBe(0);
    expect(resolvedOption.netProfit).toBe(-putOption.premium);
  });

  it('executes a CALL option with leveraged upside for contrarian evidence drops', () => {
    const marketEngine = new ValidationMarket();
    const market = marketEngine.createMarket({
      claimId: 'claim_hedge_03',
      claimText: 'Secret corporate merger leaked.',
      creatorDid: 'did:plc:creator',
      initialBounty: 100
    });

    // Market initially heavily favored VERIFIED
    marketEngine.placeStake({
      marketId: market.marketId,
      stakerDid: 'did:plc:crowd',
      outcome: OUTCOMES.VERIFIED,
      amount: 500
    });

    // Contrarian buys a CALL option on MISINFORMED with strike odds 4.0
    const callOption = marketEngine.purchaseHedgeOption({
      stakerDid: 'did:plc:contrarian',
      marketId: market.marketId,
      type: OPTION_TYPES.CALL,
      targetOutcome: OUTCOMES.MISINFORMED,
      notionalAmount: 50,
      strikeOdds: 4.0
    });

    expect(callOption.type).toBe('CALL');
    expect(callOption.status).toBe('ACTIVE');

    // Civic Courtroom settles MISINFORMED
    const settlement = marketEngine.settleMarket(market.marketId, OUTCOMES.MISINFORMED);
    const resolvedOption = settlement.settledOptions[0];
    expect(resolvedOption.status).toBe('EXERCISED');
    expect(resolvedOption.payout).toBeGreaterThan(50);
  });

  it('retrieves hedge options for specific user DID', () => {
    const marketEngine = new ValidationMarket();
    const market = marketEngine.createMarket({
      claimId: 'claim_hedge_04',
      claimText: 'Vaccine study replication.',
      creatorDid: 'did:plc:creator',
      initialBounty: 50
    });

    marketEngine.purchaseHedgeOption({
      stakerDid: 'did:plc:investor_99',
      marketId: market.marketId,
      type: OPTION_TYPES.PUT,
      targetOutcome: OUTCOMES.VERIFIED,
      notionalAmount: 100
    });

    const userOpts = marketEngine.getHedgeOptionsForUser('did:plc:investor_99');
    expect(userOpts.length).toBe(1);
    expect(userOpts[0].stakerDid).toBe('did:plc:investor_99');
    expect(marketEngine.getHedgeOptionsForUser('did:plc:unknown').length).toBe(0);
  });
});
