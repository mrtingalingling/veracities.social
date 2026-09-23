import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deploy() {
  const isSimulation = process.argv.includes('--simulate') || process.argv.includes('--dry-run') || !process.env.RPC_URL;
  console.log(`[Deployer] Starting deployment (Mode: ${isSimulation ? 'SIMULATION / TEST' : 'LIVE NETWORK'})...`);

  // 1. Load compiled artifacts
  const buildDir = path.resolve(__dirname, '../contracts/build');
  const marketArtifactPath = path.join(buildDir, 'ValidationMarket.json');
  const escrowArtifactPath = path.join(buildDir, 'CourtroomEscrow.json');

  if (!fs.existsSync(marketArtifactPath) || !fs.existsSync(escrowArtifactPath)) {
    throw new Error('Build artifacts missing! Run "node scripts/compileContracts.js" first.');
  }

  const marketArtifact = JSON.parse(fs.readFileSync(marketArtifactPath, 'utf8'));
  const escrowArtifact = JSON.parse(fs.readFileSync(escrowArtifactPath, 'utf8'));

  let chainId = 84532; // Default: Base Sepolia
  let networkName = 'base-sepolia';
  let marketAddress = '';
  let escrowAddress = '';
  let deployerAddress = '';
  let treasuryAddress = process.env.PROTOCOL_TREASURY_ADDRESS || '0x1111111111111111111111111111111111111111';
  let oracleAddress = process.env.ORACLE_SIGNER_ADDRESS || '0x2222222222222222222222222222222222222222';

  if (!isSimulation && process.env.RPC_URL && process.env.DEPLOYER_PRIVATE_KEY) {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const network = await provider.getNetwork();
    chainId = Number(network.chainId);
    networkName = network.name || `chain-${chainId}`;

    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    deployerAddress = wallet.address;
    console.log(`[Deployer] Connected account: ${deployerAddress} on chain ${chainId}`);

    // Deploy ValidationMarket
    const MarketFactory = new ethers.ContractFactory(marketArtifact.abi, marketArtifact.bytecode, wallet);
    console.log('[Deployer] Deploying ValidationMarket...');
    const marketContract = await MarketFactory.deploy(treasuryAddress, oracleAddress);
    await marketContract.waitForDeployment();
    marketAddress = await marketContract.getAddress();
    console.log(`[Deployer] ValidationMarket deployed to: ${marketAddress}`);

    // Deploy CourtroomEscrow
    const EscrowFactory = new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, wallet);
    console.log('[Deployer] Deploying CourtroomEscrow...');
    const escrowContract = await EscrowFactory.deploy(treasuryAddress);
    await escrowContract.waitForDeployment();
    escrowAddress = await escrowContract.getAddress();
    console.log(`[Deployer] CourtroomEscrow deployed to: ${escrowAddress}`);
  } else {
    // Deterministic simulation deployment
    const randomDeployer = ethers.Wallet.createRandom();
    deployerAddress = randomDeployer.address;
    marketAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 0 });
    escrowAddress = ethers.getCreateAddress({ from: deployerAddress, nonce: 1 });
    console.log(`[Deployer] Simulation Addresses:\n  - Deployer: ${deployerAddress}\n  - ValidationMarket: ${marketAddress}\n  - CourtroomEscrow: ${escrowAddress}`);
  }

  // 2. Prepare JSON configuration export
  const deploymentConfig = {
    network: networkName,
    chainId: chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    protocolTreasury: treasuryAddress,
    oracleSigner: oracleAddress,
    contracts: {
      ValidationMarket: {
        address: marketAddress,
        abi: marketArtifact.abi
      },
      CourtroomEscrow: {
        address: escrowAddress,
        abi: escrowArtifact.abi
      }
    }
  };

  // 3. Export to veracities.social/src/config/contracts.json
  const socialConfigDir = path.resolve(__dirname, '../src/config');
  if (!fs.existsSync(socialConfigDir)) fs.mkdirSync(socialConfigDir, { recursive: true });
  const socialConfigPath = path.join(socialConfigDir, 'contracts.json');
  fs.writeFileSync(socialConfigPath, JSON.stringify(deploymentConfig, null, 2));
  console.log(`[Deployer] Exported configuration to: ${socialConfigPath}`);

  // 4. Export to clearCloud/src/config/contracts.json
  const clearCloudConfigDir = path.resolve(__dirname, '../../clearCloud/src/config');
  if (!fs.existsSync(clearCloudConfigDir)) fs.mkdirSync(clearCloudConfigDir, { recursive: true });
  const clearCloudConfigPath = path.join(clearCloudConfigDir, 'contracts.json');
  fs.writeFileSync(clearCloudConfigPath, JSON.stringify(deploymentConfig, null, 2));
  console.log(`[Deployer] Exported configuration to: ${clearCloudConfigPath}`);

  console.log('[Deployer] Deployment pipeline completed successfully.');
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
