-- CreateTable
CREATE TABLE "CompetitionUpdate" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "source" TEXT,
    "level" TEXT,
    "award" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationUpdate" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "source" TEXT,
    "evalType" TEXT,
    "result" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionUpdate_personId_idx" ON "CompetitionUpdate"("personId");

-- CreateIndex
CREATE INDEX "CompetitionUpdate_publishedAt_idx" ON "CompetitionUpdate"("publishedAt");

-- CreateIndex
CREATE INDEX "EvaluationUpdate_personId_idx" ON "EvaluationUpdate"("personId");

-- CreateIndex
CREATE INDEX "EvaluationUpdate_publishedAt_idx" ON "EvaluationUpdate"("publishedAt");

-- AddForeignKey
ALTER TABLE "CompetitionUpdate" ADD CONSTRAINT "CompetitionUpdate_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationUpdate" ADD CONSTRAINT "EvaluationUpdate_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
