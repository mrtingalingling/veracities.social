import { decentralizedStorageAdapter } from '../storage/storageService.js';

export const LEXICON_IDS = {
  DOCKET: 'social.veracities.courtroom.docket',
  VERDICT: 'social.veracities.courtroom.verdict',
  IDENTITY_LINK: 'social.veracities.identity.link'
};

export class AtprotoDocketService {
  constructor(storageAdapter = decentralizedStorageAdapter) {
    this.storage = storageAdapter;
    this.publishedDockets = new Map();
    this.publishedVerdicts = new Map();
  }

  /**
   * Prepares and validates a federated ATProto courtroom docket record.
   * Uploads primary evidence to pluggable decentralized storage (IPFS/Arweave) and attaches CIDs.
   */
  async createFederatedDocketRecord(caseData) {
    const {
      caseId,
      title,
      claimText,
      category = 'EMPIRICAL',
      creatorDid,
      dagNodes = [],
      evidence = []
    } = caseData;

    if (!caseId || !title || !claimText || !creatorDid) {
      throw new Error('caseId, title, claimText, and creatorDid are required for ATProto docket');
    }

    // 1. Process evidence and archive to decentralized storage (IPFS / Arweave)
    const evidenceCids = [];
    for (let i = 0; i < evidence.length; i++) {
      const item = evidence[i];
      if (typeof item === 'string' && (item.startsWith('ipfs://') || item.startsWith('ar://'))) {
        evidenceCids.push(item);
      } else {
        const stored = await this.storage.storeEvidence({
          title: `Evidence for ${caseId} (#${i + 1})`,
          claimId: caseId,
          authorDid: creatorDid,
          content: typeof item === 'object' ? item : { note: String(item) }
        });
        evidenceCids.push(stored.uri);
      }
    }

    // 2. Build ATProto record conforming to social.veracities.courtroom.docket
    const record = {
      $type: LEXICON_IDS.DOCKET,
      caseId,
      title: title.slice(0, 280),
      claimText: claimText.slice(0, 3000),
      category,
      creatorDid,
      dagNodes: dagNodes.map(node => ({
        nodeId: node.nodeId || 'sub_0',
        text: node.text || '',
        dependencies: node.dependencies || []
      })),
      evidenceCids,
      createdAt: new Date().toISOString()
    };

    this.publishedDockets.set(caseId, record);
    return record;
  }

  /**
   * Prepares and validates a federated ATProto courtroom verdict record.
   * Archives decisive evidence and signed attestation to decentralized storage.
   */
  async createFederatedVerdictRecord(verdictData) {
    const {
      caseId,
      claimText,
      verdict,
      confidence = 1.0,
      jurorDids = [],
      decisiveWhistleblowerDid = null,
      primaryEvidence = null,
      attestationId,
      signatures = []
    } = verdictData;

    if (!caseId || !claimText || !verdict || !attestationId) {
      throw new Error('caseId, claimText, verdict, and attestationId are required for ATProto verdict');
    }

    // 1. Archive decisive evidence if provided
    let primaryEvidenceCid = null;
    if (primaryEvidence) {
      if (typeof primaryEvidence === 'string' && (primaryEvidence.startsWith('ipfs://') || primaryEvidence.startsWith('ar://'))) {
        primaryEvidenceCid = primaryEvidence;
      } else {
        const stored = await this.storage.storeEvidence({
          title: `Decisive Whistleblower Evidence for ${caseId}`,
          claimId: caseId,
          authorDid: decisiveWhistleblowerDid || 'anonymous',
          content: primaryEvidence
        });
        primaryEvidenceCid = stored.uri;
      }
    }

    // 2. Build ATProto record conforming to social.veracities.courtroom.verdict
    const record = {
      $type: LEXICON_IDS.VERDICT,
      caseId,
      claimText,
      verdict,
      confidence: Math.round(confidence * 1000) / 1000,
      jurorDids,
      decisiveWhistleblowerDid,
      primaryEvidenceCid,
      attestationId,
      signatures,
      resolvedAt: new Date().toISOString()
    };

    // 3. Store permanent verdict attestation document in decentralized storage
    const storedVerdict = await this.storage.storeVerdictRecord(record);
    record.verdictAttestationCid = storedVerdict.uri;

    this.publishedVerdicts.set(caseId, record);
    return record;
  }

  getDocketRecord(caseId) {
    return this.publishedDockets.get(caseId) || null;
  }

  getVerdictRecord(caseId) {
    return this.publishedVerdicts.get(caseId) || null;
  }
}

export const atprotoDocketService = new AtprotoDocketService();
