import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const VERDICT_TYPE_STRING = "VerdictAttestation(bytes32 marketId,uint8 verdict,address decisiveWhistleblower,address[] jurors,uint256 timestamp,uint256 nonce)";
export const DOMAIN_TYPE_STRING = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";

export const VERDICT_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(VERDICT_TYPE_STRING));
export const DOMAIN_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(DOMAIN_TYPE_STRING));
export const DOMAIN_NAME_HASH = ethers.keccak256(ethers.toUtf8Bytes("VeracitiesValidationMarket"));
export const DOMAIN_VERSION_HASH = ethers.keccak256(ethers.toUtf8Bytes("1"));

export class OracleRelayerService {
  constructor(options = {}) {
    this.chainId = options.chainId || 84532; // Default Base Sepolia
    this.verifyingContract = options.verifyingContract || ethers.ZeroAddress;
    this.oracleSignerPrivateKey = options.oracleSignerPrivateKey || null;
    this.relayerPrivateKey = options.relayerPrivateKey || null;
    this.rpcUrl = options.rpcUrl || null;
    this.simulateMode = options.simulateMode ?? (!this.rpcUrl || !this.relayerPrivateKey);

    this.settlements = new Map();
    this.pendingQueue = [];
    this.usedNonces = new Set();
    this.nonceCounter = Math.floor(Date.now() / 1000) * 1000;

    // Auto-load deployed contract address if available
    this._loadContractConfig();
  }

  _loadContractConfig() {
    try {
      const configPath = path.resolve(__dirname, '../config/contracts.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.contracts?.ValidationMarket?.address) {
          this.verifyingContract = config.contracts.ValidationMarket.address;
        }
        if (config.chainId) {
          this.chainId = config.chainId;
        }
      }
    } catch {
      // Configuration fallback
    }
  }

  /**
   * Generates canonical EIP-712 DOMAIN_SEPARATOR matching ValidationMarket.sol.
   */
  computeDomainSeparator(chainId = this.chainId, verifyingContract = this.verifyingContract) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return ethers.keccak256(
      coder.encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [DOMAIN_TYPEHASH, DOMAIN_NAME_HASH, DOMAIN_VERSION_HASH, chainId, ethers.getAddress(verifyingContract)]
      )
    );
  }

  /**
   * Generates the canonical 32-byte EIP-712 digest for a verdict attestation.
   */
  computeVerdictDigest({
    marketId,
    verdict,
    decisiveWhistleblower = ethers.ZeroAddress,
    jurors = [],
    timestamp = Math.floor(Date.now() / 1000),
    nonce = this.getNextNonce(),
    chainId = this.chainId,
    verifyingContract = this.verifyingContract
  }) {
    if (!marketId) throw new Error('marketId is required to compute digest');
    if (verdict === undefined || verdict < 0 || verdict > 3) throw new Error('Invalid verdict index (0-3)');

    const coder = ethers.AbiCoder.defaultAbiCoder();

    // 1. Pack jurors into keccak256(abi.encodePacked(jurors))
    let jurorsHash;
    if (!jurors || jurors.length === 0) {
      jurorsHash = ethers.keccak256('0x');
    } else {
      const packedJurors = ethers.concat(jurors.map(j => ethers.getBytes(ethers.getAddress(j))));
      jurorsHash = ethers.keccak256(packedJurors);
    }

    // 2. Encode EIP-712 StructHash
    const structHash = ethers.keccak256(
      coder.encode(
        ['bytes32', 'bytes32', 'uint8', 'address', 'bytes32', 'uint256', 'uint256'],
        [
          VERDICT_TYPEHASH,
          marketId,
          verdict,
          ethers.getAddress(decisiveWhistleblower || ethers.ZeroAddress),
          jurorsHash,
          timestamp,
          nonce
        ]
      )
    );

    // 3. Compute domain separator and final digest
    const domainSeparator = this.computeDomainSeparator(chainId, verifyingContract);
    const digest = ethers.keccak256(
      ethers.concat([
        ethers.toUtf8Bytes('\x19\x01'),
        ethers.getBytes(domainSeparator),
        ethers.getBytes(structHash)
      ])
    );

    return { digest, domainSeparator, structHash, timestamp, nonce };
  }

  /**
   * Cryptographically signs the verdict digest using the oracle private key.
   */
  signVerdictDigest(digest, privateKey = this.oracleSignerPrivateKey) {
    if (!privateKey) throw new Error('Oracle signer private key is required to sign digest');
    const signingKey = new ethers.SigningKey(privateKey);
    const sig = signingKey.sign(digest);
    const recoveredAddress = ethers.recoverAddress(digest, sig.serialized);

    return {
      signature: sig.serialized,
      recoveredSigner: recoveredAddress,
      r: sig.r,
      s: sig.s,
      v: sig.v
    };
  }

  getNextNonce() {
    this.nonceCounter += 1;
    return this.nonceCounter;
  }

  /**
   * Formats and signs a full settlement payload ready for on-chain submission.
   */
  prepareSettlementPayload({
    marketId,
    verdict,
    decisiveWhistleblower = ethers.ZeroAddress,
    jurors = [],
    timestamp = Math.floor(Date.now() / 1000),
    nonce = this.getNextNonce(),
    oraclePrivateKey = this.oracleSignerPrivateKey,
    chainId = this.chainId,
    verifyingContract = this.verifyingContract
  }) {
    if (this.usedNonces.has(nonce)) {
      throw new Error(`Nonce ${nonce} has already been consumed!`);
    }

    const { digest, domainSeparator, structHash } = this.computeVerdictDigest({
      marketId,
      verdict,
      decisiveWhistleblower,
      jurors,
      timestamp,
      nonce,
      chainId,
      verifyingContract
    });

    const { signature, recoveredSigner } = this.signVerdictDigest(digest, oraclePrivateKey);

    const payload = {
      marketId,
      verdict,
      decisiveWhistleblower: ethers.getAddress(decisiveWhistleblower || ethers.ZeroAddress),
      jurors: jurors.map(j => ethers.getAddress(j)),
      timestamp,
      nonce,
      signature,
      digest,
      domainSeparator,
      structHash,
      oracleSigner: recoveredSigner
    };

    return payload;
  }

  /**
   * Relays a signed verdict settlement to the blockchain or simulation engine.
   */
  async relaySettlement(settlementPayload, options = {}) {
    const isSimulate = options.simulate ?? this.simulateMode;
    const { marketId, verdict, decisiveWhistleblower, jurors, timestamp, nonce, signature } = settlementPayload;

    if (this.usedNonces.has(nonce)) {
      throw new Error(`Replay Protection: Nonce ${nonce} already submitted.`);
    }

    const statusRecord = {
      marketId,
      verdict,
      status: 'SUBMITTING',
      submittedAt: new Date().toISOString(),
      nonce,
      txHash: null,
      blockNumber: null,
      error: null
    };
    this.settlements.set(marketId, statusRecord);

    if (isSimulate) {
      // Deterministic simulation
      const mockTxHash = ethers.keccak256(ethers.toUtf8Bytes(`tx_${marketId}_${nonce}_${Date.now()}`));
      statusRecord.status = 'CONFIRMED';
      statusRecord.txHash = mockTxHash;
      statusRecord.blockNumber = 1294821;
      statusRecord.confirmedAt = new Date().toISOString();
      statusRecord.mode = 'SIMULATION';
      this.usedNonces.add(nonce);
      return statusRecord;
    }

    // Live on-chain execution
    try {
      const provider = new ethers.JsonRpcProvider(options.rpcUrl || this.rpcUrl);
      const relayerWallet = new ethers.Wallet(options.relayerPrivateKey || this.relayerPrivateKey, provider);
      const contractAddress = options.contractAddress || this.verifyingContract;

      const buildDir = path.resolve(__dirname, '../../contracts/build');
      const marketArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'ValidationMarket.json'), 'utf8'));

      const contract = new ethers.Contract(contractAddress, marketArtifact.abi, relayerWallet);

      const tx = await contract.settleMarket(
        marketId,
        verdict,
        decisiveWhistleblower,
        jurors,
        timestamp,
        nonce,
        signature
      );

      statusRecord.txHash = tx.hash;
      const receipt = await tx.wait();

      statusRecord.status = 'CONFIRMED';
      statusRecord.blockNumber = receipt.blockNumber;
      statusRecord.gasUsed = receipt.gasUsed.toString();
      statusRecord.confirmedAt = new Date().toISOString();
      statusRecord.mode = 'LIVE';
      this.usedNonces.add(nonce);

      return statusRecord;
    } catch (err) {
      statusRecord.status = 'FAILED';
      statusRecord.error = err.message;
      throw err;
    }
  }

  /**
   * Prepares an M-of-N citizen juror threshold EIP-712 settlement payload.
   */
  prepareMultiSigSettlementPayload({
    marketId,
    verdict,
    decisiveWhistleblower = ethers.ZeroAddress,
    jurors = [],
    jurorPrivateKeys = [],
    timestamp = Math.floor(Date.now() / 1000),
    nonce = this.getNextNonce(),
    chainId = this.chainId,
    verifyingContract = this.verifyingContract
  }) {
    if (this.usedNonces.has(nonce)) {
      throw new Error(`Nonce ${nonce} has already been consumed!`);
    }

    if (!jurors || jurors.length === 0) {
      throw new Error('Jurors array cannot be empty for multi-sig settlement');
    }

    const requiredQuorum = Math.floor((jurors.length * 2 + 2) / 3);

    const { digest, domainSeparator, structHash } = this.computeVerdictDigest({
      marketId,
      verdict,
      decisiveWhistleblower,
      jurors,
      timestamp,
      nonce,
      chainId,
      verifyingContract
    });

    const signatures = [];
    const recoveredJurors = [];

    for (const key of jurorPrivateKeys) {
      const { signature, recoveredSigner } = this.signVerdictDigest(digest, key);
      signatures.push(signature);
      recoveredJurors.push(recoveredSigner);
    }

    return {
      marketId,
      verdict,
      decisiveWhistleblower: ethers.getAddress(decisiveWhistleblower || ethers.ZeroAddress),
      jurors: jurors.map(j => ethers.getAddress(j)),
      timestamp,
      nonce,
      signatures,
      recoveredJurors,
      requiredQuorum,
      digest,
      domainSeparator,
      structHash
    };
  }

  /**
   * Relays an M-of-N threshold multi-sig verdict settlement to the blockchain or simulation engine.
   */
  async relayMultiSigSettlement(payload, options = {}) {
    const isSimulate = options.simulate ?? this.simulateMode;
    const { marketId, verdict, decisiveWhistleblower, jurors, timestamp, nonce, signatures, requiredQuorum } = payload;

    if (this.usedNonces.has(nonce)) {
      throw new Error(`Replay Protection: Nonce ${nonce} already submitted.`);
    }

    if (signatures.length < requiredQuorum) {
      throw new Error(`Quorum not met: received ${signatures.length} signatures, requires ${requiredQuorum}`);
    }

    const statusRecord = {
      marketId,
      verdict,
      status: 'SUBMITTING',
      submittedAt: new Date().toISOString(),
      nonce,
      signaturesCount: signatures.length,
      requiredQuorum,
      txHash: null,
      blockNumber: null,
      error: null
    };
    this.settlements.set(marketId, statusRecord);

    if (isSimulate) {
      const mockTxHash = ethers.keccak256(ethers.toUtf8Bytes(`tx_multisig_${marketId}_${nonce}_${Date.now()}`));
      statusRecord.status = 'CONFIRMED';
      statusRecord.txHash = mockTxHash;
      statusRecord.blockNumber = 1294825;
      statusRecord.confirmedAt = new Date().toISOString();
      statusRecord.mode = 'SIMULATION';
      this.usedNonces.add(nonce);
      return statusRecord;
    }

    // Live on-chain execution
    try {
      const provider = new ethers.JsonRpcProvider(options.rpcUrl || this.rpcUrl);
      const relayerWallet = new ethers.Wallet(options.relayerPrivateKey || this.relayerPrivateKey, provider);
      const contractAddress = options.contractAddress || this.verifyingContract;

      const buildDir = path.resolve(__dirname, '../../contracts/build');
      const marketArtifact = JSON.parse(fs.readFileSync(path.join(buildDir, 'ValidationMarket.json'), 'utf8'));

      const contract = new ethers.Contract(contractAddress, marketArtifact.abi, relayerWallet);

      const tx = await contract.settleMarketMultiSig(
        marketId,
        verdict,
        decisiveWhistleblower,
        jurors,
        timestamp,
        nonce,
        signatures
      );

      statusRecord.txHash = tx.hash;
      const receipt = await tx.wait();

      statusRecord.status = 'CONFIRMED';
      statusRecord.blockNumber = receipt.blockNumber;
      statusRecord.gasUsed = receipt.gasUsed.toString();
      statusRecord.confirmedAt = new Date().toISOString();
      statusRecord.mode = 'LIVE';
      this.usedNonces.add(nonce);

      return statusRecord;
    } catch (err) {
      statusRecord.status = 'FAILED';
      statusRecord.error = err.message;
      throw err;
    }
  }


  /**
   * Queues an attestation for background daemon processing.
   */
  queueVerdict(verdictData) {
    const queueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      data: verdictData,
      queuedAt: new Date().toISOString()
    };
    this.pendingQueue.push(queueItem);
    return queueItem;
  }

  /**
   * Processes all pending items in the queue.
   */
  async processQueue(options = {}) {
    const results = [];
    while (this.pendingQueue.length > 0) {
      const item = this.pendingQueue.shift();
      try {
        const payload = this.prepareSettlementPayload({
          ...item.data,
          oraclePrivateKey: options.oraclePrivateKey || this.oracleSignerPrivateKey
        });
        const result = await this.relaySettlement(payload, options);
        results.push({ queueId: item.id, success: true, result });
      } catch (err) {
        results.push({ queueId: item.id, success: false, error: err.message });
      }
    }
    return results;
  }

  getSettlementStatus(marketId) {
    return this.settlements.get(marketId) || null;
  }
}

export const oracleRelayerService = new OracleRelayerService();
