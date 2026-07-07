-- AlterTable
ALTER TABLE "DailyTask" ADD COLUMN     "expReward" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "taskType" TEXT NOT NULL DEFAULT 'MONITOR';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActiveDate" TIMESTAMP(3),
ADD COLUMN     "levelExp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "longestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reportAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "totalReportsApproved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalReportsRejected" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTasksCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transparencyLevel" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "User_transparencyLevel_idx" ON "User"("transparencyLevel");
