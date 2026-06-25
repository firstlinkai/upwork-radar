-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('NEW', 'INTERESTED', 'APPLIED', 'REJECTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "upworkId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "budgetType" TEXT NOT NULL,
    "budgetMin" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "clientLocation" TEXT,
    "proposalCount" INTEGER,
    "clientRating" DOUBLE PRECISION,
    "clientSpent" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skills" TEXT[],
    "aiScore" INTEGER,
    "aiRationale" TEXT,
    "aiRequirements" TEXT,
    "aiRedFlags" TEXT,
    "aiProposal" TEXT,
    "aiProcessedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'NEW',
    "isBookmarked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "apifyActorId" TEXT NOT NULL DEFAULT 'blackfalcondata/upwork-scraper',
    "searchKeywords" TEXT[] DEFAULT ARRAY['AI automation', 'n8n', 'make.com', 'workflow automation', 'AI agent']::TEXT[],
    "maxResults" INTEGER NOT NULL DEFAULT 50,
    "minHourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "minFixedBudget" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "maxProposals" INTEGER NOT NULL DEFAULT 10,
    "clientLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "emailScheduleHour" INTEGER NOT NULL DEFAULT 7,
    "emailScheduleTz" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "minScoreToEmail" INTEGER NOT NULL DEFAULT 6,
    "minScoreForProposal" INTEGER NOT NULL DEFAULT 7,
    "apifyApiKey" TEXT,
    "resendApiKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "jobsFound" INTEGER,
    "jobsMatched" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_upworkId_key" ON "Job"("upworkId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_aiScore_idx" ON "Job"("aiScore");

-- CreateIndex
CREATE INDEX "Job_postedAt_idx" ON "Job"("postedAt");

-- CreateIndex
CREATE INDEX "Job_isBookmarked_idx" ON "Job"("isBookmarked");
