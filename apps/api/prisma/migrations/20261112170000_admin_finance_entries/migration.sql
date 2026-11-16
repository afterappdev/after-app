-- CreateEnum
CREATE TYPE "AdminFinanceDirection" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "AdminFinanceCategory" AS ENUM ('VENDAS', 'INFRAESTRUTURA', 'MARKETING', 'OUTROS');

-- CreateTable
CREATE TABLE "AdminFinanceEntry" (
    "id" TEXT NOT NULL,
    "direction" "AdminFinanceDirection" NOT NULL,
    "description" TEXT NOT NULL,
    "amountBrl" DECIMAL(10,2) NOT NULL,
    "category" "AdminFinanceCategory" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminFinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminFinanceEntry_occurredAt_idx" ON "AdminFinanceEntry"("occurredAt");

-- CreateIndex
CREATE INDEX "AdminFinanceEntry_direction_occurredAt_idx" ON "AdminFinanceEntry"("direction", "occurredAt");

-- AddForeignKey
ALTER TABLE "AdminFinanceEntry" ADD CONSTRAINT "AdminFinanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
