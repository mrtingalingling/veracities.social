import { describe, it, expect } from 'vitest';
import { ValidationMarket, OUTCOMES } from '../src/market/validationMarket.js';

describe('Protocol & Settlement Backend: Validation Market Subsystem', () => {
  it('creates a validation market for a claim across 4 epistemic outcomes', () => {
    const market = new ValidationMarket();
    const created = market.createMarket({
      claimId: 'claim_climate_420',
      claimText: 'Atmospheric CO2 reached 420 ppm in 2024',
      creatorDid: 'did:plc:creator123',
      initialBounty: 100
    });

    expect(created.marketId).toBe('market_claim_climate_420');
    expect(created.status).toBe('OPEN');
    expect(created.totalPool).toBe(100);
    expect(created.outcomePools[OUTCOMES.VERIFIED]).toBe(0);
  });

  it('places stakes and dynamically updates odds', () => {
    const market = new ValidationMarket();
    market.createMarket({
      claimId: 'claim_1',
      claimText: 'Test claim',
      creatorDid: 'did:plc:creator123'
    });

    market.placeStake({
      marketId: 'market_claim_1',
      stakerDid: 'did:plc:alice',
      outcome: OUTCOMES.VERIFIED,
      amount: 150
    });

    market.placeStake({
      marketId: 'market_claim_1',
      stakerDid: 'did:plc:bob',
      outcome: OUTCOMES.MISINFORMED,
      amount: 50
    });

    const odds = market.calculateOdds('market_claim_1');
    // Total pool = 200. VERIFIED pool = 150 -> 200/150 = 1.33
    // MISINFORMED pool = 50 -> 200/50 = 4.0
    expect(odds[OUTCOMES.VERIFIED]).toBe(1.33);
    expect(odds[OUTCOMES.MISINFORMED]).toBe(4.0);
  });

  it('settles a market and distributes oracle payouts deducting protocol fee', () => {
    const market = new ValidationMarket();
    market.createMarket({
      claimId: 'claim_settle_test',
      claimText: 'FDA approved drug X',
      creatorDid: 'did:plc:fda_oracle'
    });

    market.placeStake({
      marketId: 'market_claim_settle_test',
      stakerDid: 'did:plc:alice',
      outcome: OUTCOMES.VERIFIED,
      amount: 100
    });

    market.placeStake({
      marketId: 'market_claim_settle_test',
      stakerDid: 'did:plc:bob',
      outcome: OUTCOMES.MISINFORMED,
      amount: 100
    });

    // Total pool = 200. 5% protocol cut = 10. Distributable = 190.
    const settlement = market.settleMarket('market_claim_settle_test', OUTCOMES.VERIFIED, 0.05);

    expect(settlement.status).toBe('SETTLED');
    expect(settlement.verdict).toBe(OUTCOMES.VERIFIED);
    expect(settlement.protocolCut).toBe(10);
    expect(settlement.distributablePool).toBe(190);
    expect(settlement.payouts.length).toBe(1);
    expect(settlement.payouts[0].stakerDid).toBe('did:plc:alice');
    expect(settlement.payouts[0].payout).toBe(190);
    expect(settlement.payouts[0].profit).toBe(90);
  });
});
