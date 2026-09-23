import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DecentralizedStorageAdapter } from '../src/storage/storageService.js';
import { IpfsStorageProvider } from '../src/storage/providers/ipfsStorageProvider.js';
import { ArweaveStorageProvider } from '../src/storage/providers/arweaveStorageProvider.js';
import { AtprotoDocketService, LEXICON_IDS } from '../src/courtroom/atprotoDocketService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Pluggable Decentralized Storage & ATProto Courtroom Lexicons', () => {
  let storageAdapter;
  let atprotoService;

  beforeEach(() => {
    storageAdapter = new DecentralizedStorageAdapter();
    atprotoService = new AtprotoDocketService(storageAdapter);
  });

  describe('ATProto Custom Lexicon Schemas', () => {
    it('validates social.veracities.courtroom.docket lexicon schema file', () => {
      const schemaPath = path.resolve(__dirname, '../lexicons/social/veracities/courtroom/docket.json');
      expect(fs.existsSync(schemaPath)).toBe(true);

      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      expect(schema.id).toBe(LEXICON_IDS.DOCKET);
      expect(schema.defs.main.type).toBe('record');
      expect(schema.defs.main.record.required).toContain('caseId');
      expect(schema.defs.main.record.required).toContain('claimText');
      expect(schema.defs.main.record.required).toContain('creatorDid');
    });

    it('validates social.veracities.courtroom.verdict lexicon schema file', () => {
      const schemaPath = path.resolve(__dirname, '../lexicons/social/veracities/courtroom/verdict.json');
      expect(fs.existsSync(schemaPath)).toBe(true);

      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      expect(schema.id).toBe(LEXICON_IDS.VERDICT);
      expect(schema.defs.main.type).toBe('record');
      expect(schema.defs.main.record.required).toContain('verdict');
      expect(schema.defs.main.record.required).toContain('jurorDids');
      expect(schema.defs.main.record.properties.verdict.enum).toEqual([
        'VERIFIED', 'MISINFORMED', 'DISPUTED', 'NEED_CONTEXT'
      ]);
    });
  });

  describe('Pluggable Decentralized Storage Providers (IPFS & Arweave)', () => {
    it('generates authentic standard CIDv1 base32 hashes with IpfsStorageProvider', async () => {
      const ipfsProvider = new IpfsStorageProvider();
      const content = 'Decisive medical lab timestamp corroborating hospital alibi.';
      
      const uploadResult = await ipfsProvider.upload(content, { author: 'did:pkh:0x123' });

      expect(uploadResult.provider).toBe('ipfs');
      expect(uploadResult.cid).toMatch(/^bafkrei[a-z0-9]+$/); // Standard CIDv1 base32 prefix
      expect(uploadResult.uri).toBe(`ipfs://${uploadResult.cid}`);
      expect(uploadResult.gatewayUrl).toBe(`https://ipfs.io/ipfs/${uploadResult.cid}`);

      // Fetch
      const fetched = await ipfsProvider.fetch(uploadResult.uri);
      expect(fetched.data).toBe(content);

      // Verify integrity
      const isValid = await ipfsProvider.verify(uploadResult.uri, content);
      expect(isValid).toBe(true);

      const isTampered = await ipfsProvider.verify(uploadResult.uri, 'Tampered evidence content');
      expect(isTampered).toBe(false);
    });

    it('generates standard Arweave base64url transaction IDs with ArweaveStorageProvider', async () => {
      const arweaveProvider = new ArweaveStorageProvider();
      const content = 'Public video footage archive showing speech timestamp.';

      const uploadResult = await arweaveProvider.upload(content);

      expect(uploadResult.provider).toBe('arweave');
      expect(uploadResult.cid).toMatch(/^[A-Za-z0-9_-]{43}$/); // Standard 43-character Arweave TX ID
      expect(uploadResult.uri).toBe(`ar://${uploadResult.cid}`);
      expect(uploadResult.gatewayUrl).toBe(`https://arweave.net/${uploadResult.cid}`);

      // Fetch
      const fetched = await arweaveProvider.fetch(uploadResult.uri);
      expect(fetched.data).toBe(content);

      // Verify integrity
      const isValid = await arweaveProvider.verify(uploadResult.uri, content);
      expect(isValid).toBe(true);

      const isTampered = await arweaveProvider.verify(uploadResult.uri, 'Corrupted video data');
      expect(isTampered).toBe(false);
    });

    it('allows hot-swapping active storage providers without changing client code', async () => {
      expect(storageAdapter.activeProviderName).toBe('ipfs');

      const evidenceA = await storageAdapter.storeEvidence({
        title: 'IPFS Document',
        content: 'Original clinical trial report'
      });
      expect(evidenceA.uri.startsWith('ipfs://')).toBe(true);

      // Hot-swap to Arweave
      storageAdapter.setActiveProvider('arweave');
      expect(storageAdapter.activeProviderName).toBe('arweave');

      const evidenceB = await storageAdapter.storeEvidence({
        title: 'Arweave Document',
        content: 'Immutable archive report'
      });
      expect(evidenceB.uri.startsWith('ar://')).toBe(true);

      // Storage adapter automatically routes fetch based on URI scheme
      const fetchedA = await storageAdapter.fetchContent(evidenceA.uri);
      expect(fetchedA.data).toBe('Original clinical trial report');

      const fetchedB = await storageAdapter.fetchContent(evidenceB.uri);
      expect(fetchedB.data).toBe('Immutable archive report');
    });
  });

  describe('Federated ATProto Courtroom Docket & Verdict Service', () => {
    it('creates federated docket record, archives evidence to IPFS, and attaches CIDs', async () => {
      const docketRecord = await atprotoService.createFederatedDocketRecord({
        caseId: 'case_climate_target_2030',
        title: 'Country X met net-zero interim targets in 2025',
        claimText: 'Official energy grid figures demonstrate 42% renewable generation because new offshore wind came online.',
        category: 'STATISTICAL',
        creatorDid: 'did:plc:alice_civic_leader',
        dagNodes: [
          { nodeId: 'sub_0', text: 'Offshore wind came online', dependencies: [] },
          { nodeId: 'sub_1', text: '42% renewable generation achieved', dependencies: ['sub_0'] }
        ],
        evidence: [
          'Grid operator quarterly filing PDF data',
          'Independent auditor audit certification'
        ]
      });

      expect(docketRecord.$type).toBe(LEXICON_IDS.DOCKET);
      expect(docketRecord.caseId).toBe('case_climate_target_2030');
      expect(docketRecord.evidenceCids.length).toBe(2);
      expect(docketRecord.evidenceCids[0]).toMatch(/^ipfs:\/\/bafkrei/);
      expect(docketRecord.evidenceCids[1]).toMatch(/^ipfs:\/\/bafkrei/);
      expect(docketRecord.dagNodes.length).toBe(2);

      // Verify retrieval from service cache
      expect(atprotoService.getDocketRecord('case_climate_target_2030')).toEqual(docketRecord);
    });

    it('creates federated verdict record with multi-sig signatures and archives attestation', async () => {
      const verdictRecord = await atprotoService.createFederatedVerdictRecord({
        caseId: 'case_climate_target_2030',
        claimText: 'Official energy grid figures demonstrate 42% renewable generation.',
        verdict: 'VERIFIED',
        confidence: 0.94,
        jurorDids: [
          'did:plc:juror_alpha',
          'did:plc:juror_beta',
          'did:plc:juror_gamma',
          'did:plc:juror_delta',
          'did:plc:juror_epsilon'
        ],
        decisiveWhistleblowerDid: 'did:pkh:0xWhistleblower123',
        primaryEvidence: {
          receiptType: 'GOVERNMENT_AUDIT_DATA',
          summary: 'Verified authentic audited records'
        },
        attestationId: 'attest_case_climate_target_2030_1720000000',
        signatures: [
          '0x_sig_juror_1',
          '0x_sig_juror_2',
          '0x_sig_juror_3',
          '0x_sig_juror_4',
          '0x_sig_juror_5'
        ]
      });

      expect(verdictRecord.$type).toBe(LEXICON_IDS.VERDICT);
      expect(verdictRecord.verdict).toBe('VERIFIED');
      expect(verdictRecord.confidence).toBe(0.94);
      expect(verdictRecord.jurorDids.length).toBe(5);
      expect(verdictRecord.primaryEvidenceCid).toMatch(/^ipfs:\/\/bafkrei/);
      expect(verdictRecord.verdictAttestationCid).toMatch(/^ipfs:\/\/bafkrei/);

      // Verify content-addressed attestation can be fetched directly from storage adapter
      const storedVerdict = await storageAdapter.fetchContent(verdictRecord.verdictAttestationCid);
      expect(storedVerdict.data.caseId).toBe('case_climate_target_2030');
      expect(storedVerdict.data.signatures.length).toBe(5);
    });
  });
});
