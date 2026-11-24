ALTER TABLE "OtpChallenge"
ADD COLUMN "signupName" TEXT,
ADD COLUMN "signupPasswordHash" TEXT;

CREATE TABLE "BusinessCreationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCreationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessCreationRequest_userId_idempotencyKey_key"
ON "BusinessCreationRequest"("userId", "idempotencyKey");

CREATE INDEX "BusinessCreationRequest_businessId_idx"
ON "BusinessCreationRequest"("businessId");

ALTER TABLE "BusinessCreationRequest"
ADD CONSTRAINT "BusinessCreationRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessCreationRequest"
ADD CONSTRAINT "BusinessCreationRequest_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
