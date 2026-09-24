import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deploy() {
  const isSimulation = process.argv.includes('--simulate') || process.argv.includes('--dry-run') || !process.env.RPC_URL;
  console.log(`[Deployer] Starting deployment (Mode: ${isSimulation ? 'SIMULATION / TEST' : 'LIVE NETWORK'}, Pattern: UUPS / ERC-1967 Upgradeable)...`);

  // 1. Load compiled artifacts
  const buildDir = path.resolve(__dirname, '../contracts/build');
  const marketArtifactPath = path.join(buildDir, 'ValidationMarket.json');
  const escrowArtifactPath = path.join(buildDir, 'CourtroomEscrow.json');
  const govArtifactPath = path.join(buildDir, 'EpistemicGovernor.json');
  const crsArtifactPath = path.join(buildDir, 'EpistemicCrsManager.json');
  const proxyArtifactPath = path.join(buildDir, 'ERC1967Proxy.json');

  if (!fs.existsSync(marketArtifactPath) || !fs.existsSync(escrowArtifactPath) || !fs.existsSync(govArtifactPath) || !fs.existsSync(crsArtifactPath) || !fs.existsSync(proxyArtifactPath)) {
    throw new Error('Build artifacts missing! Run "node scripts/compileContracts.js" first.');
  }

  const marketArtifact = JSON.parse(fs.readFileSync(marketArtifactPath, 'utf8'));
  const escrowArtifact = JSON.parse(fs.readFileSync(escrowArtifactPath, 'utf8'));
  const govArtifact = JSON.parse(fs.readFileSync(govArtifactPath, 'utf8'));
  const crsArtifact = JSON.parse(fs.readFileSync(crsArtifactPath, 'utf8'));
  const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));

  let chainId = 84532; // Default: Base Sepolia
  let networkName = 'base-sepolia';
  let marketProxyAddress = '';
  let marketImplAddress = '';
  let escrowProxyAddress = '';
  let escrowImplAddress = '';
  let govProxyAddress = '';
  let govImplAddress = '';
  let crsProxyAddress = '';
  let crsImplAddress = '';
  let deployerAddress = '';
  let treasuryAddress = process.env.PROTOCOL_TREASURY_ADDRESS || '0x1111111111111111111111111111111111111111';
  let oracleAddress = process.env.ORACLE_SIGNER_ADDRESS || '0x2222222222222222222222222222222222222222';
  let parentDAOAddress = process.env.PARENT_DAO_ADDRESS || ethers.ZeroAddress;
  let defaultMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes('veracities.epistemic.citizens.v1'));

  const marketInterface = new ethers.Interface(marketArtifact.abi);
  const escrowInterface = new ethers.Interface(escrowArtifact.abi);
  const govInterface = new ethers.Interface(govArtifact.abi);
  const crsInterface = new ethers.Interface(crsArtifact.abi);

  if (!isSimulation && process.env.RPC_URL && process.env.DEPLOYER_PRIVATE_KEY) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const network = await provider.getNetwork();
    chainId = Number(network.chainId);
    networkName = network.name || `chain-${chainId}`;

    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    deployerAddress = wallet.address;
    console.log(`[Deployer] Connected account: ${deployerAddress} on chain ${chainId}`);

    // Deploy ValidationMarket implementation + ERC1967Proxy
    const MarketFactory = new ethers.ContractFactory(marketArtifact.abi, marketArtifact.bytecode, wallet);
    const marketImpl = await MarketFactory.deploy();
    await marketImpl.waitForDeployment();
    marketImplAddress = await marketImpl.getAddress();

    const marketInitData = marketInterface.encodeFunctionData('initialize', [treasuryAddress, oracleAddress]);
    const ProxyFactory = new ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, wallet);
    const marketProxy = await ProxyFactory.deploy(marketImplAddress, marketInitData);
    await marketProxy.waitForDeployment();
    marketProxyAddress = await marketProxy.getAddress();
    console.log(`[Deployer] ValidationMarket Proxy: ${marketProxyAddress} (Impl: ${marketImplAddress})`);

    // Deploy CourtroomEscrow implementation + ERC1967Proxy
    const EscrowFactory = new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, wallet);
    const escrowImpl = await EscrowFactory.deploy();
    await escrowImpl.waitForDeployment();
    escrowImplAddress = await escrowImpl.getAddress();

    const escrowInitData = escrowInterface.encodeFunctionData('initialize', [treasuryAddress]);
    const escrowProxy = await ProxyFactory.deploy(escrowImplAddress, escrowInitData);
    await escrowProxy.waitForDeployment();
    escrowProxyAddress = await escrowProxy.getAddress();
    console.log(`[Deployer] CourtroomEscrow Proxy: ${escrowProxyAddress} (Impl: ${escrowImplAddress})`);

    // Deploy EpistemicGovernor implementation + ERC1967Proxy
    const GovFactory = new ethers.ContractFactory(govArtifact.abi, govArtifact.bytecode, wallet);
    const govImpl = await GovFactory.deploy();
    await govImpl.waitForDeployment();
    govImplAddress = await govImpl.getAddress();

    const govInitData = govInterface.encodeFunctionData('initialize', [defaultMerkleRoot, parentDAOAddress, 0]); // 0 = STANDALONE
    const govProxy = await ProxyFactory.deploy(govImplAddress, govInitData);
    await govProxy.waitForDeployment();
    govProxyAddress = await govProxy.getAddress();
    console.log(`[Deployer] EpistemicGovernor Proxy: ${govProxyAddress} (Impl: ${govImplAddress})`);

    // Deploy EpistemicCrsManager implementation + ERC1967Proxy
    const CrsFactory = new ethers.ContractFactory(crsArtifact.abi, crsArtifact.bytecode, wallet);
    const crsImpl = await CrsFactory.deploy();
    await crsImpl.waitForDeployment();
    crsImplAddress = await crsImpl.getAddress();

    const crsInitData = crsInterface.encodeFunctionData('initialize', [deployerAddress, oracleAddress]);
    const crsProxy = await ProxyFactory.deploy(crsImplAddress, crsInitData);
    await crsProxy.waitForDeployment();
    crsProxyAddress = await crsProxy.getAddress();
    console.log(`[Deployer] EpistemicCrsManager Proxy: ${crsProxyAddress} (Impl: ${crsImplAddress})`);
  } else {
    // Deterministic simulation deployment (avoids diff churn on test runs)
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Standard Hardhat / Anvil account 0
    const testWallet = new ethers.Wallet(testPrivateKey);
    deployerAddress = testWallet.address;
    marketImplAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 0 });
    marketProxyAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 1 });
    escrowImplAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 2 });
    escrowProxyAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 3 });
    govImplAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 4 });
    govProxyAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 5 });
    crsImplAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 6 });
    crsProxyAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 7 });

    console.log(`[Deployer] Simulation Upgradeable Addresses:\n  - Deployer: ${deployerAddress}\n  - ValidationMarket: ${marketProxyAddress} (Impl: ${marketImplAddress})\n  - CourtroomEscrow: ${escrowProxyAddress} (Impl: ${escrowImplAddress})\n  - EpistemicGovernor: ${govProxyAddress} (Impl: ${govImplAddress})\n  - EpistemicCrsManager: ${crsProxyAddress} (Impl: ${crsImplAddress})`);
  }

  // 2. Prepare JSON configuration export
  const existingConfigPath = path.resolve(__dirname, '../src/config/contracts.json');
  let deployedAt = new Date().toISOString();
  if (isSimulation && fs.existsSync(existingConfigPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(existingConfigPath, 'utf8'));
      if (existing.deployedAt) deployedAt = existing.deployedAt;
    } catch (_) {}
  }

  const deploymentConfig = {
    network: networkName,
    chainId: chainId,
    deployedAt: deployedAt,
    deployer: deployerAddress,
    protocolTreasury: treasuryAddress,
    oracleSigner: oracleAddress,
    proxyPattern: 'UUPS / ERC-1967',
    contracts: {
      ValidationMarket: {
        address: marketProxyAddress,
        implementation: marketImplAddress,
        isUpgradeable: true,
        proxyType: 'ERC1967',
        abi: marketArtifact.abi
      },
      CourtroomEscrow: {
        address: escrowProxyAddress,
        implementation: escrowImplAddress,
        isUpgradeable: true,
        proxyType: 'ERC1967',
        abi: escrowArtifact.abi
      },
      EpistemicGovernor: {
        address: govProxyAddress,
        implementation: govImplAddress,
        isUpgradeable: true,
        proxyType: 'ERC1967',
        parentFramework: 'STANDALONE',
        abi: govArtifact.abi
      },
      EpistemicCrsManager: {
        address: crsProxyAddress,
        implementation: crsImplAddress,
        isUpgradeable: true,
        proxyType: 'ERC1967',
        abi: crsArtifact.abi
      },
      ERC1967Proxy: {
        abi: proxyArtifact.abi
      }
    }
  };

  // 3. Export to veracities.social and clearCloud contracts.json
  const formattedJson = JSON.stringify(deploymentConfig, null, 2) + '\n';
  const socialConfigDir = path.resolve(__dirname, '../src/config');
  if (!fs.existsSync(socialConfigDir)) fs.mkdirSync(socialConfigDir, { recursive: true });
  const socialConfigPath = path.join(socialConfigDir, 'contracts.json');
  if (!fs.existsSync(socialConfigPath) || fs.readFileSync(socialConfigPath, 'utf8') !== formattedJson) {
    fs.writeFileSync(socialConfigPath, formattedJson);
    console.log(`[Deployer] Exported configuration to: ${socialConfigPath}`);
  }

  const clearCloudConfigDir = path.resolve(__dirname, '../../clearCloud/src/config');
  if (!fs.existsSync(clearCloudConfigDir)) fs.mkdirSync(clearCloudConfigDir, { recursive: true });
  const clearCloudConfigPath = path.join(clearCloudConfigDir, 'contracts.json');
  if (!fs.existsSync(clearCloudConfigPath) || fs.readFileSync(clearCloudConfigPath, 'utf8') !== formattedJson) {
    fs.writeFileSync(clearCloudConfigPath, formattedJson);
    console.log(`[Deployer] Exported configuration to: ${clearCloudConfigPath}`);
  }

  console.log('[Deployer] Upgradeable deployment pipeline completed successfully.');
  return deploymentConfig;
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('deploy.js')) {
  deploy().catch(err => {
    console.error('[Deployer] Error during deployment:', err);
    process.exit(1);
  });
}

export { deploy };
