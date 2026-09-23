import { PrismaClient } from '@prisma/client';

export class DatabaseService {
  constructor(options = {}) {
    this.usePrisma = options.usePrisma ?? (Boolean(process.env.DATABASE_URL) && !options.inMemoryOnly);
    this.prisma = null;

    // High-fidelity in-memory relational store for testing, offline, or fallback mode
    this.tables = {
      users: new Map(),
      posts: new Map(),
      docketCases: new Map(),
      jurorVotes: new Map(),
      validationMarkets: new Map(),
      marketStakes: new Map(),
      attestationRecords: new Map()
    };

    if (this.usePrisma) {
      try {
        this.prisma = new PrismaClient();
      } catch (err) {
        console.warn('[DatabaseService] Prisma client initialization fallback to in-memory store:', err.message);
        this.usePrisma = false;
      }
    }
  }

  // --- Users & Identity Links ---
  async upsertUser({ did, handle = null, walletAddress = null, siweNonce = null }) {
    if (!did) throw new Error('did is required to upsert user');

    if (this.usePrisma && this.prisma) {
      return await this.prisma.user.upsert({
        where: { did },
        update: { handle, walletAddress, siweNonce, updatedAt: new Date() },
        create: { did, handle, walletAddress, siweNonce }
      });
    }

    const existing = this.tables.users.get(did) || { did, createdAt: new Date() };
    const updated = {
      ...existing,
      handle: handle !== undefined ? handle : existing.handle,
      walletAddress: walletAddress !== undefined ? walletAddress : existing.walletAddress,
      siweNonce: siweNonce !== undefined ? siweNonce : existing.siweNonce,
      updatedAt: new Date()
    };
    this.tables.users.set(did, updated);
    return updated;
  }

  async findUserByDid(did) {
    if (this.usePrisma && this.prisma) {
      return await this.prisma.user.findUnique({ where: { did } });
    }
    return this.tables.users.get(did) || null;
  }

  async findUserByWallet(walletAddress) {
    if (!walletAddress) return null;
    const normalized = walletAddress.toLowerCase();

    if (this.usePrisma && this.prisma) {
      return await this.prisma.user.findFirst({
        where: { walletAddress: { equals: normalized, mode: 'insensitive' } }
      });
    }

    for (const u of this.tables.users.values()) {
      if (u.walletAddress && u.walletAddress.toLowerCase() === normalized) {
        return u;
      }
    }
    return null;
  }

  // --- Posts & Claims ---
  async createPost({ uri, cid, authorDid, text, claimText = null, groundednessScore = null }) {
    if (!uri || !cid || !authorDid) throw new Error('uri, cid, and authorDid are required');

    if (this.usePrisma && this.prisma) {
      return await this.prisma.post.create({
        data: { uri, cid, authorDid, text, claimText, groundednessScore }
      });
    }

    const post = {
      id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      uri,
      cid,
      authorDid,
      text,
      claimText,
      groundednessScore,
      createdAt: new Date()
    };
    this.tables.posts.set(post.id, post);
    return post;
  }

  async getPostByUri(uri) {
    if (this.usePrisma && this.prisma) {
      return await this.prisma.post.findUnique({ where: { uri } });
    }
    for (const p of this.tables.posts.values()) {
      if (p.uri === uri) return p;
    }
    return null;
  }

  // --- Docket Cases ---
  async createDocketCase({
    id,
    title,
    claimText,
    creatorDid,
    blindedProposition = null,
    postId = null
  }) {
    if (!id || !title || !claimText || !creatorDid) {
      throw new Error('id, title, claimText, and creatorDid are required');
    }

    if (this.usePrisma && this.prisma) {
      return await this.prisma.docketCase.create({
        data: { id, title, claimText, creatorDid, blindedProposition, postId }
      });
    }

    const docket = {
      id,
      title,
      claimText,
      creatorDid,
      blindedProposition,
      postId,
      status: 'ACTIVE',
      finalVerdict: null,
      confidence: null,
      reasoning: null,
      decisiveEvidenceContributorDid: null,
      decisiveEvidenceUrl: null,
      onChainTxHash: null,
      createdAt: new Date(),
      concludedAt: null
    };
    this.tables.docketCases.set(id, docket);
    return docket;
  }

  async getDocketCase(id) {
    if (this.usePrisma && this.prisma) {
      return await this.prisma.docketCase.findUnique({
        where: { id },
        include: { votes: true, market: true }
      });
    }
    const docket = this.tables.docketCases.get(id);
    if (!docket) return null;

    const votes = Array.from(this.tables.jurorVotes.values()).filter(v => v.caseId === id);
    const market = Array.from(this.tables.validationMarkets.values()).find(m => m.caseId === id) || null;

    return { ...docket, votes, market };
  }

  async concludeDocketCase(id, {
    finalVerdict,
    confidence = 1.0,
    reasoning = '',
    decisiveEvidenceContributorDid = null,
    decisiveEvidenceUrl = null,
    onChainTxHash = null
  }) {
    if (this.usePrisma && this.prisma) {
      return await this.prisma.docketCase.update({
        where: { id },
        data: {
          status: 'CONCLUDED',
          finalVerdict,
          confidence,
          reasoning,
          decisiveEvidenceContributorDid,
          decisiveEvidenceUrl,
          onChainTxHash,
          concludedAt: new Date()
        }
      });
    }

    const docket = this.tables.docketCases.get(id);
    if (!docket) throw new Error(`DocketCase ${id} not found`);

    const updated = {
      ...docket,
      status: 'CONCLUDED',
      finalVerdict,
      confidence,
      reasoning,
      decisiveEvidenceContributorDid,
      decisiveEvidenceUrl,
      onChainTxHash,
      concludedAt: new Date()
    };
    this.tables.docketCases.set(id, updated);
    return updated;
  }

  // --- Juror Votes ---
  async castJurorVote({ caseId, jurorDid, vote, weight = 1.0, evidenceUrl = null }) {
    if (!caseId || !jurorDid || !vote) throw new Error('caseId, jurorDid, and vote are required');

    if (this.usePrisma && this.prisma) {
      return await this.prisma.jurorVote.upsert({
        where: { caseId_jurorDid: { caseId, jurorDid } },
        update: { vote, weight, evidenceUrl },
        create: { caseId, jurorDid, vote, weight, evidenceUrl }
      });
    }

    const voteKey = `${caseId}_${jurorDid}`;
    const voteRecord = {
      id: `vote_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      caseId,
      jurorDid,
      vote,
      weight,
      evidenceUrl,
      createdAt: new Date()
    };
    this.tables.jurorVotes.set(voteKey, voteRecord);
    return voteRecord;
  }

  async getVotesForCase(caseId) {
    if (this.usePrisma && this.prisma) {
      return await this.prisma.jurorVote.findMany({ where: { caseId } });
    }
    return Array.from(this.tables.jurorVotes.values()).filter(v => v.caseId === caseId);
  }

  // --- Validation Markets ---
  async createValidationMarket({ id, caseId, claimText, creatorAddress, totalPool = '0' }) {
    if (!id || !caseId || !claimText || !creatorAddress) {
      throw new Error('id, caseId, claimText, and creatorAddress are required');
    }

    if (this.usePrisma && this.prisma) {
      return await this.prisma.validationMarket.create({
        data: { id, caseId, claimText, creatorAddress, totalPool }
      });
    }

    const market = {
      id,
      caseId,
      claimText,
      creatorAddress,
      totalPool: totalPool.toString(),
      status: 'OPEN',
      finalVerdict: null,
      decisiveWhistleblower: null,
      onChainTxHash: null,
      winningPoolZero: false,
      createdAt: new Date(),
      settledAt: null
    };
    this.tables.validationMarkets.set(id, market);
    return market;
  }

  async getValidationMarket(id) {
    if (this.usePrisma && this.prisma) {
      return await this.prisma.validationMarket.findUnique({
        where: { id },
        include: { stakes: true }
      });
    }

    const market = this.tables.validationMarkets.get(id);
    if (!market) return null;

    const stakes = Array.from(this.tables.marketStakes.values()).filter(s => s.marketId === id);
    return { ...market, stakes };
  }

  async recordMarketStake({ id, marketId, stakerAddress, outcome, amount }) {
    if (!marketId || !stakerAddress || outcome === undefined || !amount) {
      throw new Error('marketId, stakerAddress, outcome, and amount are required');
    }

    const stakeId = id || `stake_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    if (this.usePrisma && this.prisma) {
      const stake = await this.prisma.marketStake.create({
        data: { id: stakeId, marketId, stakerAddress, outcome, amount: amount.toString() }
      });
      // Increment totalPool
      const market = await this.prisma.validationMarket.findUnique({ where: { id: marketId } });
      if (market) {
        const newTotal = (BigInt(market.totalPool || '0') + BigInt(amount)).toString();
        await this.prisma.validationMarket.update({
          where: { id: marketId },
          data: { totalPool: newTotal }
        });
      }
      return stake;
    }

    const stake = {
      id: stakeId,
      marketId,
      stakerAddress,
      outcome,
      amount: amount.toString(),
      claimed: false,
      payoutAmount: null,
      createdAt: new Date()
    };
    this.tables.marketStakes.set(stakeId, stake);

    const market = this.tables.validationMarkets.get(marketId);
    if (market) {
      const newTotal = (BigInt(market.totalPool || '0') + BigInt(amount)).toString();
      market.totalPool = newTotal;
    }

    return stake;
  }

  async settleValidationMarket(id, {
    finalVerdict,
    decisiveWhistleblower = null,
    onChainTxHash = null,
    winningPoolZero = false
  }) {
    if (this.usePrisma && this.prisma) {
      return await this.prisma.validationMarket.update({
        where: { id },
        data: {
          status: 'SETTLED',
          finalVerdict,
          decisiveWhistleblower,
          onChainTxHash,
          winningPoolZero,
          settledAt: new Date()
        }
      });
    }

    const market = this.tables.validationMarkets.get(id);
    if (!market) throw new Error(`ValidationMarket ${id} not found`);

    const updated = {
      ...market,
      status: 'SETTLED',
      finalVerdict,
      decisiveWhistleblower,
      onChainTxHash,
      winningPoolZero,
      settledAt: new Date()
    };
    this.tables.validationMarkets.set(id, updated);
    return updated;
  }

  // --- Attestation Records ---
  async saveAttestationRecord({
    id,
    caseId,
    marketId = null,
    verdict,
    confidence = 1.0,
    oracleSignature,
    messageHash,
    nonce,
    onChainTxHash = null
  }) {
    if (!id || !caseId || !verdict || !oracleSignature || !messageHash || !nonce) {
      throw new Error('id, caseId, verdict, oracleSignature, messageHash, and nonce are required');
    }

    if (this.usePrisma && this.prisma) {
      return await this.prisma.attestationRecord.create({
        data: { id, caseId, marketId, verdict, confidence, oracleSignature, messageHash, nonce, onChainTxHash }
      });
    }

    const record = {
      id,
      caseId,
      marketId,
      verdict,
      confidence,
      oracleSignature,
      messageHash,
      nonce,
      onChainTxHash,
      verifiedAt: new Date()
    };
    this.tables.attestationRecords.set(nonce, record);
    return record;
  }

  async getAttestationByNonce(nonce) {
    if (this.usePrisma && this.prisma) {
      return await this.prisma.attestationRecord.findUnique({ where: { nonce } });
    }
    return this.tables.attestationRecords.get(nonce) || null;
  }

  async close() {
    if (this.prisma) {
      await this.prisma.$disconnect();
    }
  }
}

export const databaseService = new DatabaseService();
