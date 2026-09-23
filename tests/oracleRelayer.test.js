import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { OracleRelayerService, VERDICT_TYPEHASH, DOMAIN_TYPEHASH } from '../src/oracle/oracleRelayer.js';
import { oracleRelayerBridge } from '../../clearCloud/src/courtroom/oracleRelayerBridge.js';

describe('Automated Oracle Relayer Daemon & EIP-712 Settlement', () => {
  const testOracleWallet = ethers.Wallet.createRandom();
  const testContractAddress = '0x52A615A0eE2D0dfC0899e1501e7c4Dd90e7A7BAE';
  const testChainId = 84532; // Base Sepolia

  const relayer = new OracleRelayerService({
    chainId: testChainId,
    verifyingContract: testContractAddress,
    oracleSignerPrivateKey: testOracleWallet.privateKey,
    simulateMode: true
  });

  it('computes exact EIP-712 Domain Separator and Verdict TypeHash matching Solidity', () => {
    const domainSeparator = relayer.computeDomainSeparator(testChainId, testContractAddress);
    expect(domainSeparator).toMatch(/^0x[a-f0-9]{64}$/i);

    const expectedVerdictType = "VerdictAttestation(bytes32 marketId,uint8 verdict,address decisiveWhistleblower,address[] jurors,uint256 timestamp,uint256 nonce)";
    expect(VERDICT_TYPEHASH).toBe(ethers.keccak256(ethers.toUtf8Bytes(expectedVerdictType)));

    const expectedDomainType = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
    expect(DOMAIN_TYPEHASH).toBe(ethers.keccak256(ethers.toUtf8Bytes(expectedDomainType)));
  });

  it('generates canonical EIP-712 digest and verifies cryptographic signature recovery', () => {
    const marketId = ethers.keccak256(ethers.toUtf8Bytes('claim_golf_vs_doctor_alibi'));
    const verdict = 1; // MISINFORMED
    const decisiveWhistleblower = '0x1111111111111111111111111111111111111111';
    const jurors = [
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333'
    ];
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = 5001;

    const { digest } = relayer.computeVerdictDigest({
      marketId,
      verdict,
      decisiveWhistleblower,
      jurors,
      timestamp,
      nonce
    });

    expect(digest).toMatch(/^0x[a-f0-9]{64}$/i);

    // Sign digest
    const { signature, recoveredSigner } = relayer.signVerdictDigest(digest, testOracleWallet.privateKey);

    expect(signature).toMatch(/^0x[a-f0-9]{130}$/i); // 65 bytes (130 hex + 0x)
    expect(recoveredSigner.toLowerCase()).toBe(testOracleWallet.address.toLowerCase());
  });

  it('prepares and relays on-chain settlement payload in simulation mode', async () => {
    const marketId = ethers.keccak256(ethers.toUtf8Bytes('claim_inflation_reduction_act'));
    const payload = relayer.prepareSettlementPayload({
      marketId,
      verdict: 0, // VERIFIED
      decisiveWhistleblower: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      jurors: ['0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'],
      nonce: 9901
    });

    expect(payload.marketId).toBe(marketId);
    expect(payload.verdict).toBe(0);
    expect(payload.oracleSigner.toLowerCase()).toBe(testOracleWallet.address.toLowerCase());

    const result = await relayer.relaySettlement(payload);

    expect(result.status).toBe('CONFIRMED');
    expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(result.blockNumber).toBeGreaterThan(0);
    expect(relayer.getSettlementStatus(marketId)).toEqual(result);
  });

  it('enforces replay protection by rejecting duplicate nonces', async () => {
    const duplicateNonce = 88888;
    const marketIdA = ethers.keccak256(ethers.toUtf8Bytes('claim_a'));
    const marketIdB = ethers.keccak256(ethers.toUtf8Bytes('claim_b'));

    const payloadA = relayer.prepareSettlementPayload({
      marketId: marketIdA,
      verdict: 2, // DISPUTED
      nonce: duplicateNonce
    });

    await relayer.relaySettlement(payloadA);

    // Attempting to submit another settlement with the same nonce must throw
    const payloadB = {
      ...payloadA,
      marketId: marketIdB,
      nonce: duplicateNonce
    };

    await expect(relayer.relaySettlement(payloadB)).rejects.toThrow(/Replay Protection/);
  });

  it('processes queued verdicts asynchronously via processQueue', async () => {
    const queueItem1 = relayer.queueVerdict({
      marketId: ethers.keccak256(ethers.toUtf8Bytes('queue_claim_1')),
      verdict: 0,
      jurors: ['0x1111111111111111111111111111111111111111']
    });

    const queueItem2 = relayer.queueVerdict({
      marketId: ethers.keccak256(ethers.toUtf8Bytes('queue_claim_2')),
      verdict: 3,
      jurors: ['0x2222222222222222222222222222222222222222']
    });

    expect(relayer.pendingQueue.length).toBe(2);

    const results = await relayer.processQueue();

    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(relayer.pendingQueue.length).toBe(0);
  });

  it('bridges Courtroom jury verdicts into on-chain settlement via oracleRelayerBridge', async () => {
    const mockVerdict = {
      caseId: 'case_john_golfing_monday',
      verdict: 'MISINFORMED',
      confidence: 0.85,
      reasoning: 'Documented medical records place subject at hospital at the alleged time.',
      decisiveEvidenceContributorDid: 'did:pkh:eip155:1:0x1234567890123456789012345678901234567890',
      participatingJurorDids: [
        'did:pkh:eip155:1:0x2222222222222222222222222222222222222222',
        'did:pkh:eip155:1:0x3333333333333333333333333333333333333333'
      ]
    };

    const bridgeResult = await oracleRelayerBridge.relayVerdict(mockVerdict);

    expect(bridgeResult.status).toBe('CONFIRMED');
    expect(bridgeResult.payload.verdictIndex).toBe(1); // MISINFORMED index = 1
    expect(bridgeResult.payload.decisiveWhistleblower).toBe('0x1234567890123456789012345678901234567890');
    expect(bridgeResult.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
  });
});
