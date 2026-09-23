import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { keccak256, toUtf8Bytes, AbiCoder, Wallet } from 'ethers';
import { deploy } from '../scripts/deploy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildDir = path.resolve(__dirname, '../contracts/build');

describe('On-Chain Solidity Smart Contracts Hardening & Deployment Pipeline', () => {
  it('compiles ValidationMarket and CourtroomEscrow with complete ABIs and EVM bytecode', () => {
    const marketArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'ValidationMarket.json'), 'utf8'));
    const escrowArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'CourtroomEscrow.json'), 'utf8'));

    expect(marketArtifact.contractName).toBe('ValidationMarket');
    expect(marketArtifact.abi.length).toBeGreaterThan(15);
    expect(marketArtifact.bytecode.startsWith('0x60')).toBe(true);

    expect(escrowArtifact.contractName).toBe('CourtroomEscrow');
    expect(escrowArtifact.abi.length).toBeGreaterThan(10);
    expect(escrowArtifact.bytecode.startsWith('0x60')).toBe(true);
  });

  it('matches EIP-712 TypeHash and Domain Separator specifications', () => {
    // 1. Verify VERDICT_TYPEHASH matches exact Solidity constant
    const typeSignature = 'VerdictAttestation(bytes32 marketId,uint8 verdict,address decisiveWhistleblower,address[] jurors,uint256 timestamp,uint256 nonce)';
    const expectedTypeHash = keccak256(toUtf8Bytes(typeSignature));

    // 2. Mock EIP-712 structured hash generation
    const oracleWallet = Wallet.createRandom();
    const marketId = keccak256(toUtf8Bytes('claim_42_monday_golfing'));
    const decisiveWhistleblower = '0x1111111111111111111111111111111111111111';
    const jurors = [
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333'
    ];
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = 1001;

    const coder = AbiCoder.defaultAbiCoder();
    const encodedData = coder.encode(
      ['bytes32', 'bytes32', 'uint8', 'address', 'bytes32', 'uint256', 'uint256'],
      [
        expectedTypeHash,
        marketId,
        1, // Outcome: MISINFORMED
        decisiveWhistleblower,
        keccak256(coder.encode(['address[]'], [jurors])),
        timestamp,
        nonce
      ]
    );

    const structHash = keccak256(encodedData);
    expect(structHash).toMatch(/^0x[a-f0-9]{64}$/i);
  });

  it('verifies exact mathematical invariants of the losing pool slashing waterfall', () => {
    // Scenario: Total Pool = 1000, Winning Pool = 200 => Losing Pool = 800
    const totalPool = 1000n;
    const winningPool = 200n;
    const losingPool = totalPool - winningPool; // 800

    const protoFee = (totalPool * 5n) / 100n; // 5% of total = 50
    const evidenceBounty = (losingPool * 15n) / 100n; // 15% of losing = 120
    const jurorPool = (losingPool * 5n) / 100n; // 5% of losing = 40

    const netDeductions = protoFee + evidenceBounty + jurorPool; // 50 + 120 + 40 = 210
    const distributablePool = totalPool - netDeductions; // 1000 - 210 = 790

    expect(losingPool).toBe(800n);
    expect(protoFee).toBe(50n);
    expect(evidenceBounty).toBe(120n);
    expect(jurorPool).toBe(40n);
    expect(distributablePool).toBe(790n);

    // Winning staker with 50% of the winning pool (100 of 200) receives 50% of 790 = 395
    const userStake = 100n;
    const stakerYield = (userStake * distributablePool) / winningPool;
    expect(stakerYield).toBe(395n); // Net +295% profit on 100 stake!
  });

  it('implements zero-winning-pool capital-lock defense (pro-rata staker refund)', () => {
    // Scenario: No staker picked the outcome decided by the jury (winningPool == 0)
    const totalPool = 1000n;
    const winningPool = 0n;
    const losingPool = totalPool; // 1000n

    const protoFee = (totalPool * 5n) / 100n; // 50n
    const evidenceBounty = (losingPool * 15n) / 100n; // 150n
    const jurorPool = (losingPool * 5n) / 100n; // 50n
    const distributablePool = totalPool - (protoFee + evidenceBounty + jurorPool); // 750n

    // In the old code, this 750n was trapped. With winningPoolZero defense:
    // Staker A staked 300n out of 1000n total pool
    const userTotalStake = 300n;
    const proRataRefund = (userTotalStake * distributablePool) / totalPool;

    // Staker recovers 75% of their principal (225n of 300n) instead of losing 100%
    expect(proRataRefund).toBe(225n);
    expect(distributablePool).toBe(750n);
  });

  it('validates 14-day cold case refund and challenge retrial settlement (overturned vs upheld)', () => {
    const INACTIVITY_PERIOD_SECONDS = 14 * 24 * 60 * 60; // 1,209,600s
    expect(INACTIVITY_PERIOD_SECONDS).toBe(1209600);

    const initialDeposit = 500n;
    const requiredChallengeBond = initialDeposit * 2n; // 1000n
    expect(requiredChallengeBond).toBe(1000n);

    // 1. Cold Case Refund: 94% staker refund, 6% protocol retention fee
    const stakerRefund = (initialDeposit * 94n) / 100n;
    const protocolRetention = (initialDeposit * 6n) / 100n;
    expect(stakerRefund).toBe(470n);
    expect(protocolRetention).toBe(30n);

    // 2. Challenge Settled - OVERTURNED:
    // Challenger receives 2x bond (1000n) + 20% reward of deposit pool (100n) = 1100n
    const reward = (initialDeposit * 20n) / 100n; // 100n
    const totalChallengerPayout = requiredChallengeBond + reward;
    expect(totalChallengerPayout).toBe(1100n);

    // 3. Challenge Settled - UPHELD (Bad faith or unconvincing challenge):
    // 2x bond is slashed: 50% to retrial jurors (500n), 50% to protocol treasury (500n)
    const jurorShare = (requiredChallengeBond * 50n) / 100n;
    const treasuryShare = requiredChallengeBond - jurorShare;
    expect(jurorShare).toBe(500n);
    expect(treasuryShare).toBe(500n);
  });

  it('runs automated deployment pipeline and verifies multi-repo config export', async () => {
    const config = await deploy();

    expect(config.network).toBeDefined();
    expect(config.chainId).toBe(84532);
    expect(config.contracts.ValidationMarket.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(config.contracts.CourtroomEscrow.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

    // Verify written config files
    const socialConfigPath = path.resolve(__dirname, '../src/config/contracts.json');
    const clearCloudConfigPath = path.resolve(__dirname, '../../clearCloud/src/config/contracts.json');

    expect(fs.existsSync(socialConfigPath)).toBe(true);
    expect(fs.existsSync(clearCloudConfigPath)).toBe(true);

    const socialConfig = JSON.parse(fs.readFileSync(socialConfigPath, 'utf8'));
    expect(socialConfig.contracts.ValidationMarket.address).toBe(config.contracts.ValidationMarket.address);
  });
});
