import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { OracleRelayerService } from '../src/oracle/oracleRelayer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runRelayerDaemon() {
  const isSimulation = process.argv.includes('--simulate') || !process.env.RPC_URL;
  const isOnce = process.argv.includes('--once');
  const isWatch = process.argv.includes('--watch');

  console.log(`[Relayer Daemon] Starting (Mode: ${isSimulation ? 'SIMULATION' : 'LIVE'})`);

  const relayer = new OracleRelayerService({
    rpcUrl: process.env.RPC_URL,
    oracleSignerPrivateKey: process.env.ORACLE_SIGNER_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000002',
    relayerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001',
    simulateMode: isSimulation
  });

  console.log(`[Relayer Daemon] Configured Verifying Contract: ${relayer.verifyingContract}`);
  console.log(`[Relayer Daemon] Target Chain ID: ${relayer.chainId}`);

  // If invoked with a sample test verdict or --simulate flag
  if (isSimulation || isOnce) {
    console.log('[Relayer Daemon] Dispatching sample test verdict...');
    const sampleMarketId = ethers.keccak256(ethers.toUtf8Bytes(`claim_daemon_sample_${Date.now()}`));
    const samplePayload = relayer.prepareSettlementPayload({
      marketId: sampleMarketId,
      verdict: 1, // MISINFORMED
      decisiveWhistleblower: '0x1111111111111111111111111111111111111111',
      jurors: [
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333'
      ]
    });

    console.log(`[Relayer Daemon] Prepared Settlement:
  - Market ID: ${samplePayload.marketId}
  - Verdict: MISINFORMED (1)
  - Whistleblower: ${samplePayload.decisiveWhistleblower}
  - Signer: ${samplePayload.oracleSigner}
  - Signature: ${samplePayload.signature.substring(0, 18)}...`);

    const result = await relayer.relaySettlement(samplePayload, { simulate: isSimulation });
    console.log(`[Relayer Daemon] Settlement Result:
  - Status: ${result.status}
  - TxHash: ${result.txHash}
  - Block: ${result.blockNumber}`);

    if (isOnce || isSimulation) {
      console.log('[Relayer Daemon] Finished single run cycle.');
      return result;
    }
  }

  if (isWatch) {
    console.log('[Relayer Daemon] Entering persistent polling loop...');
    // Simulated watcher interval
    setInterval(async () => {
      if (relayer.pendingQueue.length > 0) {
        console.log(`[Relayer Daemon] Processing ${relayer.pendingQueue.length} queued verdicts...`);
        const results = await relayer.processQueue();
        console.log(`[Relayer Daemon] Processed ${results.length} verdicts.`);
      }
    }, 5000);
  }
}

if (process.argv[1] && process.argv[1].endsWith('relayer.js')) {
  runRelayerDaemon().catch(err => {
    console.error('[Relayer Daemon] Fatal error:', err);
    process.exit(1);
  });
}

export { runRelayerDaemon };
