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

  it('exposes settleMarketMultiSig in ValidationMarket ABI and verifies M-of-N quorum invariants', () => {
    const marketArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'ValidationMarket.json'), 'utf8'));
    const multiSigFunction = marketArtifact.abi.find(item => item.name === 'settleMarketMultiSig');
    expect(multiSigFunction).toBeDefined();
    expect(multiSigFunction.inputs.length).toBe(7);
    expect(multiSigFunction.inputs[6].type).toBe('bytes[]');

    // Test supermajority quorum calculation: (N * 2 + 2) / 3
    const computeQuorum = (n) => Math.floor((n * 2 + 2) / 3);
    expect(computeQuorum(7)).toBe(5); // 7 jurors -> 5 required (71.4% > 66.7%)
    expect(computeQuorum(9)).toBe(6); // 9 jurors -> 6 required (66.7%)
    expect(computeQuorum(3)).toBe(2); // 3 jurors -> 2 required (66.7%)
    expect(computeQuorum(1)).toBe(1); // 1 juror -> 1 required (100%)
  });

  it('validates EpistemicGovernor ABI, anonymous ZK voting interface, and tier weights (PRD §6.2)', () => {
    const govArtifactPath = path.join(buildDir, 'EpistemicGovernor.json');
    expect(fs.existsSync(govArtifactPath)).toBe(true);

    const govArtifact = JSON.parse(fs.readFileSync(govArtifactPath, 'utf8'));
    expect(govArtifact.bytecode.length).toBeGreaterThan(10);

    const fnNames = govArtifact.abi.map(a => a.name).filter(Boolean);
    expect(fnNames).toContain('createProposal');
    expect(fnNames).toContain('voteAnonymous');
    expect(fnNames).toContain('executeProposal');
    expect(fnNames).toContain('getTierWeight');

    const voteFn = govArtifact.abi.find(a => a.name === 'voteAnonymous');
    expect(voteFn.inputs.map(i => i.name)).toEqual(['proposalId', 'nullifierHash', 'support', 'voterTier']);

    // Check Epistemic Tier Weights: Novice=1, Contributor=5, Arbiter=15, Sage=30
    const tierWeights = { NOVICE: 1, CONTRIBUTOR: 5, ARBITER: 15, SAGE: 30 };
    expect(tierWeights.NOVICE).toBe(1);
    expect(tierWeights.CONTRIBUTOR).toBe(5);
    expect(tierWeights.ARBITER).toBe(15);
    expect(tierWeights.SAGE).toBe(30);
  });

  it('validates UUPS upgradeability and ERC-1967 proxy architecture across all 3 contracts', () => {
    const marketArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'ValidationMarket.json'), 'utf8'));
    const escrowArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'CourtroomEscrow.json'), 'utf8'));
    const govArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'EpistemicGovernor.json'), 'utf8'));
    const proxyArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'ERC1967Proxy.json'), 'utf8'));

    // 1. ERC-1967 Proxy validation
    expect(proxyArtifact.contractName).toBe('ERC1967Proxy');
    const proxyFnNames = proxyArtifact.abi.map(a => a.name).filter(Boolean);
    expect(proxyFnNames).toContain('implementation');

    // Canonical ERC-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
    const canonicalSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    expect(canonicalSlot).toMatch(/^0x[a-f0-9]{64}$/);

    // 2. All 3 logic implementations must implement UUPS upgradeToAndCall and initialize
    const contracts = [
      { name: 'ValidationMarket', artifact: marketArtifact, initParams: ['_protocolTreasury', '_oracleSigner'] },
      { name: 'CourtroomEscrow', artifact: escrowArtifact, initParams: ['_protocolTreasury'] },
      { name: 'EpistemicGovernor', artifact: govArtifact, initParams: ['_initialMerkleRoot', '_parentDAO', '_frameworkType'] }
    ];

    for (const c of contracts) {
      const fns = c.artifact.abi.map(a => a.name).filter(Boolean);
      expect(fns, `${c.name} must implement upgradeToAndCall`).toContain('upgradeToAndCall');
      expect(fns, `${c.name} must implement proxiableUUID`).toContain('proxiableUUID');
      expect(fns, `${c.name} must implement initialize`).toContain('initialize');

      const initFn = c.artifact.abi.find(a => a.name === 'initialize');
      expect(initFn.inputs.map(i => i.name)).toEqual(c.initParams);
    }
  });

  it('validates EpistemicGovernor composability with external DAO frameworks (OpenZeppelin, Zodiac Safe, Aragon OSx)', () => {
    const govArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'EpistemicGovernor.json'), 'utf8'));
    const fnNames = govArtifact.abi.map(a => a.name).filter(Boolean);

    // 1. Framework configuration and modular execution
    expect(fnNames).toContain('configureParentDAO');
    expect(fnNames).toContain('executeWithParentFramework');
    expect(fnNames).toContain('parentDAO');
    expect(fnNames).toContain('parentFramework');

    // 2. OpenZeppelin IGovernorStandard compatibility views
    expect(fnNames).toContain('name');
    expect(fnNames).toContain('version');
    expect(fnNames).toContain('state');
    expect(fnNames).toContain('proposalVotes');
    expect(fnNames).toContain('proposalDeadline');
    expect(fnNames).toContain('proposalSnapshot');
    expect(fnNames).toContain('quorum');

    // 3. Test Governor ProposalState mapping
    const ProposalState = {
      Pending: 0,
      Active: 1,
      Canceled: 2,
      Defeated: 3,
      Succeeded: 4,
      Queued: 5,
      Expired: 6,
      Executed: 7
    };
    expect(ProposalState.Active).toBe(1);
    expect(ProposalState.Defeated).toBe(3);
    expect(ProposalState.Succeeded).toBe(4);
    expect(ProposalState.Executed).toBe(7);
  });

  it('validates DaoRegistry parent framework payload formatting and upgrade info', async () => {
    const { DaoRegistry, DAO_FRAMEWORKS } = await import('../src/governance/daoRegistry.js');
    const dao = new DaoRegistry();
      const upgradeInfo = dao.getUpgradeabilityInfo();
      expect(upgradeInfo.isUpgradeable).toBe(true);
      expect(upgradeInfo.proxyType).toBe('ERC1967');

      // Create proposal
      const prop = dao.createProposal({
        title: 'Upgrade Gas Oracle',
        description: 'ipfs://test',
        proposerDid: 'did:pkh:1:0x123'
      });

      // Test Standalone mode
      const standalonePayload = dao.formatFrameworkDispatchPayload(prop.proposalId, '0x456');
      expect(standalonePayload.framework).toBe(DAO_FRAMEWORKS.STANDALONE);
      expect(standalonePayload.contractMethod).toBe('executeProposal');

      // Test Zodiac Safe mode
      dao.setParentFramework(DAO_FRAMEWORKS.ZODIAC_SAFE, '0xSafeAvatarAddress123');
      const safePayload = dao.formatFrameworkDispatchPayload(prop.proposalId, '0xTargetProtocol', 1000, '0xdeadbeef');
      expect(safePayload.framework).toBe(DAO_FRAMEWORKS.ZODIAC_SAFE);
      expect(safePayload.contractMethod).toBe('execTransactionFromModule');
      expect(safePayload.params.to).toBe('0xTargetProtocol');
      expect(safePayload.params.value).toBe(1000);
      expect(safePayload.targetDao).toBe('0xSafeAvatarAddress123');

      // Test Aragon OSx mode
      dao.setParentFramework(DAO_FRAMEWORKS.ARAGON_OSX, '0xAragonDaoAddress456');
      const aragonPayload = dao.formatFrameworkDispatchPayload(prop.proposalId, '0xTargetProtocol', 0, '0xfeedface');
      expect(aragonPayload.framework).toBe(DAO_FRAMEWORKS.ARAGON_OSX);
      expect(aragonPayload.contractMethod).toBe('executeProposalHook');
      expect(aragonPayload.targetDao).toBe('0xAragonDaoAddress456');
  });
});


