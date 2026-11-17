CREATE TABLE "EventoUserCheck" (
    "userId" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventoUserCheck_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "EventoUserCheck" ADD CONSTRAINT "EventoUserCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;