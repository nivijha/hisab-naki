-- Reconcile the Transaction idempotency uniqueness with the Prisma schema.
-- The initial migration created a partial unique index; the schema now models
-- @@unique([businessId, idempotencyKey]). PostgreSQL treats NULL values as
-- distinct in both definitions, so this does not change null-key behaviour.

DROP INDEX IF EXISTS "Transaction_businessId_idempotencyKey_key";

CREATE UNIQUE INDEX "Transaction_businessId_idempotencyKey_key"
  ON "Transaction" ("businessId", "idempotencyKey");
