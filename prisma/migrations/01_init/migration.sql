-- CreateTable: User
CREATE TABLE IF NOT EXISTS "User" (
    "did" TEXT NOT NULL,
    "handle" TEXT,
    "walletAddress" TEXT,
    "siweNonce" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("did")
);

-- CreateTable: Post
CREATE TABLE IF NOT EXISTS "Post" (
    "id" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "authorDid" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "claimText" TEXT,
    "groundednessScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DocketCase
CREATE TABLE IF NOT EXISTS "DocketCase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "blindedProposition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "creatorDid" TEXT NOT NULL,
    "postId" TEXT,
    "finalVerdict" TEXT,
    "confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "decisiveEvidenceContributorDid" TEXT,
    "decisiveEvidenceUrl" TEXT,
    "onChainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concludedAt" TIMESTAMP(3),

    CONSTRAINT "DocketCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable: JurorVote
CREATE TABLE IF NOT EXISTS "JurorVote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "jurorDid" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "evidenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurorVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ValidationMarket
CREATE TABLE IF NOT EXISTS "ValidationMarket" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "creatorAddress" TEXT NOT NULL,
    "totalPool" TEXT NOT NULL DEFAULT '0',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "finalVerdict" INTEGER,
    "decisiveWhistleblower" TEXT,
    "onChainTxHash" TEXT,
    "winningPoolZero" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "ValidationMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MarketStake
CREATE TABLE IF NOT EXISTS "MarketStake" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "stakerAddress" TEXT NOT NULL,
    "outcome" INTEGER NOT NULL,
    "amount" TEXT NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "payoutAmount" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketStake_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AttestationRecord
CREATE TABLE IF NOT EXISTS "AttestationRecord" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "marketId" TEXT,
    "verdict" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "oracleSignature" TEXT NOT NULL,
    "messageHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "onChainTxHash" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttestationRecord_pkey" PRIMARY KEY ("id")
);

-- Unique constraints & Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Post_uri_key" ON "Post"("uri");
CREATE INDEX IF NOT EXISTS "User_walletAddress_idx" ON "User"("walletAddress");
CREATE UNIQUE INDEX IF NOT EXISTS "JurorVote_caseId_jurorDid_key" ON "JurorVote"("caseId", "jurorDid");
CREATE UNIQUE INDEX IF NOT EXISTS "ValidationMarket_caseId_key" ON "ValidationMarket"("caseId");
CREATE INDEX IF NOT EXISTS "MarketStake_stakerAddress_idx" ON "MarketStake"("stakerAddress");
CREATE INDEX IF NOT EXISTS "MarketStake_marketId_idx" ON "MarketStake"("marketId");
CREATE UNIQUE INDEX IF NOT EXISTS "AttestationRecord_nonce_key" ON "AttestationRecord"("nonce");

-- Foreign Keys
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorDid_fkey" FOREIGN KEY ("authorDid") REFERENCES "User"("did") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocketCase" ADD CONSTRAINT "DocketCase_creatorDid_fkey" FOREIGN KEY ("creatorDid") REFERENCES "User"("did") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocketCase" ADD CONSTRAINT "DocketCase_decisiveEvidenceContributorDid_fkey" FOREIGN KEY ("decisiveEvidenceContributorDid") REFERENCES "User"("did") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocketCase" ADD CONSTRAINT "DocketCase_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JurorVote" ADD CONSTRAINT "JurorVote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DocketCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JurorVote" ADD CONSTRAINT "JurorVote_jurorDid_fkey" FOREIGN KEY ("jurorDid") REFERENCES "User"("did") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ValidationMarket" ADD CONSTRAINT "ValidationMarket_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DocketCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketStake" ADD CONSTRAINT "MarketStake_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "ValidationMarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
