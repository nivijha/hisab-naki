-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'PAYMENT', 'SALE', 'EXPENSE', 'OPENING_BALANCE', 'SALE_RETURN', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "SaleMode" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "OpeningBalanceDirection" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'SIGNUP', 'PHONE_VERIFY', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "VoiceRequestStatus" AS ENUM ('PENDING', 'PARSED', 'APPLIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'VOID', 'DELETE', 'LOGIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "channel" "OtpChannel" NOT NULL DEFAULT 'SMS',
    "codeHash" TEXT NOT NULL,
    "status" "OtpStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'ACTIVE',
    "amount" DECIMAL(14,2) NOT NULL,
    "saleMode" "SaleMode",
    "paymentMethod" "PaymentMethod",
    "openingDirection" "OpeningBalanceDirection",
    "description" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedByUserId" TEXT,
    "voidReason" TEXT,
    "originalTransactionId" TEXT,
    "idempotencyKey" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceTransactionRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "parsedPayload" JSONB,
    "status" "VoiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VoiceTransactionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_purpose_status_idx" ON "OtpChallenge"("phone", "purpose", "status");

-- CreateIndex
CREATE INDEX "OtpChallenge_status_expiresAt_idx" ON "OtpChallenge"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Business_name_idx" ON "Business"("name");

-- CreateIndex
CREATE INDEX "Business_deletedAt_idx" ON "Business"("deletedAt");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_businessId_role_status_idx" ON "Membership"("businessId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_businessId_userId_key" ON "Membership"("businessId", "userId");

-- CreateIndex
CREATE INDEX "Customer_businessId_name_idx" ON "Customer"("businessId", "name");

-- CreateIndex
CREATE INDEX "Customer_businessId_createdByUserId_idx" ON "Customer"("businessId", "createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_id_key" ON "Customer"("businessId", "id");

-- CreateIndex
CREATE INDEX "Transaction_businessId_occurredAt_idx" ON "Transaction"("businessId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_businessId_customerId_occurredAt_idx" ON "Transaction"("businessId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_businessId_type_status_idx" ON "Transaction"("businessId", "type", "status");

-- CreateIndex
CREATE INDEX "Transaction_businessId_originalTransactionId_idx" ON "Transaction"("businessId", "originalTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_businessId_createdByUserId_idx" ON "Transaction"("businessId", "createdByUserId");

-- CreateIndex
CREATE INDEX "Transaction_businessId_voidedByUserId_idx" ON "Transaction"("businessId", "voidedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_businessId_id_key" ON "Transaction"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceTransactionRequest_transactionId_key" ON "VoiceTransactionRequest"("transactionId");

-- CreateIndex
CREATE INDEX "VoiceTransactionRequest_businessId_status_createdAt_idx" ON "VoiceTransactionRequest"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceTransactionRequest_businessId_requestedByUserId_idx" ON "VoiceTransactionRequest"("businessId", "requestedByUserId");

-- CreateIndex
CREATE INDEX "VoiceTransactionRequest_businessId_transactionId_idx" ON "VoiceTransactionRequest"("businessId", "transactionId");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_entityType_entityId_idx" ON "AuditLog"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_actorUserId_idx" ON "AuditLog"("businessId", "actorUserId");

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_originalTransactionId_fkey" FOREIGN KEY ("originalTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTransactionRequest" ADD CONSTRAINT "VoiceTransactionRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTransactionRequest" ADD CONSTRAINT "VoiceTransactionRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTransactionRequest" ADD CONSTRAINT "VoiceTransactionRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- HisabNaki integrity layer (corrected)
-- PostgreSQL 17
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CHECK constraints
-- ---------------------------------------------------------------------
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amount_positive"
  CHECK ("amount" > 0),

  ADD CONSTRAINT "Transaction_type_fields"
  CHECK (
    CASE "type"
      WHEN 'CREDIT' THEN
        "customerId" IS NOT NULL
        AND "saleMode" IS NULL
        AND "paymentMethod" IS NULL
        AND "openingDirection" IS NULL
        AND "originalTransactionId" IS NULL
      WHEN 'PAYMENT' THEN
        "customerId" IS NOT NULL
        AND "saleMode" IS NULL
        AND "paymentMethod" IS NOT NULL
        AND "openingDirection" IS NULL
        AND "originalTransactionId" IS NULL
      WHEN 'SALE' THEN
        "openingDirection" IS NULL
        AND "originalTransactionId" IS NULL
        AND "saleMode" IS NOT NULL
        AND (
          ("saleMode" = 'CASH' AND "paymentMethod" IS NOT NULL)
          OR ("saleMode" = 'CREDIT' AND "customerId" IS NOT NULL AND "paymentMethod" IS NULL)
        )
      WHEN 'EXPENSE' THEN
        "customerId" IS NULL
        AND "saleMode" IS NULL
        AND "paymentMethod" IS NOT NULL
        AND "openingDirection" IS NULL
        AND "originalTransactionId" IS NULL
      WHEN 'OPENING_BALANCE' THEN
        "customerId" IS NOT NULL
        AND "saleMode" IS NULL
        AND "paymentMethod" IS NULL
        AND "openingDirection" IS NOT NULL
        AND "originalTransactionId" IS NULL
      WHEN 'SALE_RETURN' THEN
        "saleMode" IS NULL
        AND "paymentMethod" IS NULL
        AND "openingDirection" IS NULL
        AND "originalTransactionId" IS NOT NULL
      WHEN 'REFUND' THEN
        "saleMode" IS NULL
        AND "paymentMethod" IS NOT NULL
        AND "openingDirection" IS NULL
        AND "originalTransactionId" IS NOT NULL
      ELSE FALSE
    END
  ),

  ADD CONSTRAINT "Transaction_void_fields"
  CHECK (
    ("status" = 'ACTIVE'
      AND "voidedAt" IS NULL
      AND "voidedByUserId" IS NULL
      AND "voidReason" IS NULL)
    OR
    ("status" = 'VOIDED'
      AND "voidedAt" IS NOT NULL
      AND "voidedByUserId" IS NOT NULL
      AND "voidReason" IS NOT NULL)
  );

ALTER TABLE "OtpChallenge"
  ADD CONSTRAINT "OtpChallenge_expiry_order"
  CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "OtpChallenge_attempts_nonnegative"
  CHECK ("attempts" >= 0),
  ADD CONSTRAINT "OtpChallenge_consumed_consistency"
  CHECK (
    ("status" = 'CONSUMED' AND "consumedAt" IS NOT NULL)
    OR ("status" <> 'CONSUMED' AND "consumedAt" IS NULL)
  );

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actor_shape"
  CHECK (
    ("actorType" = 'USER'    AND "actorUserId" IS NOT NULL)
    OR ("actorType" = 'SYSTEM' AND "actorUserId" IS NULL)
  );

-- ---------------------------------------------------------------------
-- 2. Partial unique indexes
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "Customer_businessId_phone_active_key"
  ON "Customer" ("businessId", "phone")
  WHERE "phone" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Transaction_businessId_idempotencyKey_key"
  ON "Transaction" ("businessId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "OtpChallenge_phone_purpose_active_key"
  ON "OtpChallenge" ("phone", "purpose")
  WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------
-- 3. Tenant + membership composite FKs
-- ---------------------------------------------------------------------
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_business_createdBy_fk"
  FOREIGN KEY ("businessId", "createdByUserId")
  REFERENCES "Membership" ("businessId", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_business_customer_fk"
  FOREIGN KEY ("businessId", "customerId")
  REFERENCES "Customer" ("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_business_createdBy_fk"
  FOREIGN KEY ("businessId", "createdByUserId")
  REFERENCES "Membership" ("businessId", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_business_voidedBy_fk"
  FOREIGN KEY ("businessId", "voidedByUserId")
  REFERENCES "Membership" ("businessId", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_business_original_fk"
  FOREIGN KEY ("businessId", "originalTransactionId")
  REFERENCES "Transaction" ("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VoiceTransactionRequest"
  ADD CONSTRAINT "VoiceRequest_business_requestedBy_fk"
  FOREIGN KEY ("businessId", "requestedByUserId")
  REFERENCES "Membership" ("businessId", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VoiceTransactionRequest"
  ADD CONSTRAINT "VoiceRequest_business_transaction_fk"
  FOREIGN KEY ("businessId", "transactionId")
  REFERENCES "Transaction" ("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_business_actor_fk"
  FOREIGN KEY ("businessId", "actorUserId")
  REFERENCES "Membership" ("businessId", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 4. Balance helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "customer_balance"(p_business text, p_customer text)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(
    CASE t."type"
      WHEN 'CREDIT' THEN t."amount"
      WHEN 'PAYMENT' THEN -t."amount"
      WHEN 'SALE' THEN
        CASE WHEN t."saleMode" = 'CASH' THEN 0::numeric ELSE t."amount" END
      WHEN 'EXPENSE' THEN 0::numeric
      WHEN 'OPENING_BALANCE' THEN
        CASE WHEN t."openingDirection" = 'INCREASE' THEN t."amount" ELSE -t."amount" END
      WHEN 'SALE_RETURN' THEN -t."amount"
      WHEN 'REFUND' THEN t."amount"
      ELSE 0::numeric
    END
  ), 0::numeric)
  FROM "Transaction" t
  WHERE t."businessId" = p_business
    AND t."customerId" = p_customer
    AND t."status" = 'ACTIVE';
$$;

-- ---------------------------------------------------------------------
-- 5. Transaction guard
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "Transaction_guard_fn"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_orig    "Transaction"%ROWTYPE;
  v_returns numeric;
  v_refunds numeric;
  v_advance numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Transaction rows cannot be deleted; void instead';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'ACTIVE' THEN
      RAISE EXCEPTION 'new Transaction must be ACTIVE';
    END IF;

    IF NEW."originalTransactionId" IS NOT NULL THEN
      SELECT * INTO v_orig
        FROM "Transaction"
       WHERE "id" = NEW."originalTransactionId"
         FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'original transaction not found';
      END IF;
      IF v_orig."businessId" <> NEW."businessId" THEN
        RAISE EXCEPTION 'original transaction belongs to another business';
      END IF;
      IF v_orig."status" <> 'ACTIVE' THEN
        RAISE EXCEPTION 'original transaction is voided';
      END IF;
      IF NEW."customerId" IS DISTINCT FROM v_orig."customerId" THEN
        RAISE EXCEPTION 'linked transaction must have the same customer as the original';
      END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        NEW."businessId" || ':' || COALESCE(NEW."customerId", 'anonymous'),
        0
      )
    );

    IF NEW."originalTransactionId" IS NOT NULL THEN
      IF NEW."type" = 'SALE_RETURN' THEN
        IF v_orig."type" <> 'SALE' THEN
          RAISE EXCEPTION 'SALE_RETURN must reference a SALE';
        END IF;

        SELECT COALESCE(SUM("amount"), 0) INTO v_returns
          FROM "Transaction"
         WHERE "originalTransactionId" = v_orig."id"
           AND "status" = 'ACTIVE'
           AND "type" = 'SALE_RETURN';

        IF v_returns + NEW."amount" > v_orig."amount" THEN
          RAISE EXCEPTION 'returns exceed original sale amount';
        END IF;

      ELSIF NEW."type" = 'REFUND' THEN
        IF v_orig."type" NOT IN ('SALE', 'PAYMENT') THEN
          RAISE EXCEPTION 'REFUND must reference a SALE or a PAYMENT';
        END IF;

        IF NEW."customerId" IS NULL THEN
          IF v_orig."type" <> 'SALE' THEN
            RAISE EXCEPTION 'anonymous refund must reference a SALE';
          END IF;

          SELECT COALESCE(SUM("amount"), 0) INTO v_returns
            FROM "Transaction"
           WHERE "originalTransactionId" = v_orig."id"
             AND "status" = 'ACTIVE'
             AND "type" = 'SALE_RETURN';

          SELECT COALESCE(SUM("amount"), 0) INTO v_refunds
            FROM "Transaction"
           WHERE "originalTransactionId" = v_orig."id"
             AND "status" = 'ACTIVE'
             AND "type" = 'REFUND';

          IF v_refunds + NEW."amount" > v_returns THEN
            RAISE EXCEPTION 'anonymous refund exceeds value already returned for this sale';
          END IF;

        ELSE
          SELECT -"customer_balance"(NEW."businessId", NEW."customerId")
            INTO v_advance;

          IF v_advance <= 0 THEN
            RAISE EXCEPTION 'customer has no refundable advance';
          END IF;
          IF NEW."amount" > v_advance THEN
            RAISE EXCEPTION 'refund exceeds refundable advance';
          END IF;
        END IF;

      ELSE
        RAISE EXCEPTION 'only SALE_RETURN or REFUND may reference an original transaction';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE / void. The target row is already locked by UPDATE.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      OLD."businessId" || ':' || COALESCE(OLD."customerId", 'anonymous'),
      0
    )
  );

  IF OLD."status" = 'VOIDED' THEN
    RAISE EXCEPTION 'voided transactions are immutable';
  END IF;
  IF NEW."status" NOT IN ('ACTIVE', 'VOIDED') THEN
    RAISE EXCEPTION 'invalid transaction status transition';
  END IF;

  IF NEW."id"                    IS DISTINCT FROM OLD."id"
     OR NEW."businessId"         IS DISTINCT FROM OLD."businessId"
     OR NEW."customerId"         IS DISTINCT FROM OLD."customerId"
     OR NEW."type"               IS DISTINCT FROM OLD."type"
     OR NEW."amount"             IS DISTINCT FROM OLD."amount"
     OR NEW."saleMode"           IS DISTINCT FROM OLD."saleMode"
     OR NEW."paymentMethod"      IS DISTINCT FROM OLD."paymentMethod"
     OR NEW."openingDirection"   IS DISTINCT FROM OLD."openingDirection"
     OR NEW."originalTransactionId" IS DISTINCT FROM OLD."originalTransactionId"
     OR NEW."createdByUserId"    IS DISTINCT FROM OLD."createdByUserId"
     OR NEW."createdAt"          IS DISTINCT FROM OLD."createdAt"
     OR NEW."occurredAt"         IS DISTINCT FROM OLD."occurredAt"
     OR NEW."idempotencyKey"     IS DISTINCT FROM OLD."idempotencyKey"
  THEN
    RAISE EXCEPTION 'immutable transaction fields cannot be changed';
  END IF;

  IF NEW."status" = 'VOIDED' THEN
    IF EXISTS (
      SELECT 1
        FROM "Transaction"
       WHERE "originalTransactionId" = OLD."id"
         AND "status" = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'cannot void a transaction with active dependent transactions';
    END IF;

    IF OLD."type" = 'SALE_RETURN' THEN
      SELECT COALESCE(SUM("amount"), 0) INTO v_returns
        FROM "Transaction"
       WHERE "originalTransactionId" = OLD."originalTransactionId"
         AND "status" = 'ACTIVE'
         AND "type" = 'SALE_RETURN'
         AND "id" <> OLD."id";

      SELECT COALESCE(SUM("amount"), 0) INTO v_refunds
        FROM "Transaction"
       WHERE "originalTransactionId" = OLD."originalTransactionId"
         AND "status" = 'ACTIVE'
         AND "type" = 'REFUND';

      IF v_refunds > v_returns THEN
        RAISE EXCEPTION 'voiding this return would leave refunds exceeding returned value';
      END IF;
    END IF;

    IF NEW."description" IS DISTINCT FROM OLD."description" THEN
      RAISE EXCEPTION 'description cannot be changed while voiding';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Transaction_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "Transaction"
FOR EACH ROW EXECUTE FUNCTION "Transaction_guard_fn"();

-- ---------------------------------------------------------------------
-- 6. OWNER invariant
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "business_owner_guard_fn"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."deletedAt" IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM "Membership"
       WHERE "businessId" = NEW."id"
         AND "role" = 'OWNER'
         AND "status" = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'active business % must have an active OWNER', NEW."id";
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "business_owner_guard"
AFTER INSERT OR UPDATE ON "Business"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "business_owner_guard_fn"();

CREATE OR REPLACE FUNCTION "membership_owner_guard_fn"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_business text;
  v_deleted  timestamptz(3);
BEGIN
  v_business := COALESCE(NEW."businessId", OLD."businessId");

  SELECT "deletedAt" INTO v_deleted
    FROM "Business"
   WHERE "id" = v_business
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_deleted IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM "Membership"
       WHERE "businessId" = v_business
         AND "role" = 'OWNER'
         AND "status" = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'business % must retain an active OWNER', v_business;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "membership_owner_guard"
AFTER INSERT OR UPDATE OR DELETE ON "Membership"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "membership_owner_guard_fn"();

-- ---------------------------------------------------------------------
-- 7. Audit append-only + actor guard + hard-delete protection
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "audit_append_only_fn"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$;

CREATE TRIGGER "AuditLog_no_update_delete"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "audit_append_only_fn"();

CREATE TRIGGER "AuditLog_no_truncate"
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION "audit_append_only_fn"();

CREATE OR REPLACE FUNCTION "AuditLog_actor_guard_fn"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."actorType" = 'USER' THEN
    PERFORM 1
      FROM "Membership"
     WHERE "businessId" = NEW."businessId"
       AND "userId" = NEW."actorUserId"
       AND "status" = 'ACTIVE'
       FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'audit actor must be an active member of the business';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditLog_actor_guard"
BEFORE INSERT ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "AuditLog_actor_guard_fn"();

CREATE OR REPLACE FUNCTION "block_hard_delete_fn"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'hard delete is not allowed on %; use soft delete/status', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "Business_no_delete"
BEFORE DELETE ON "Business"
FOR EACH ROW EXECUTE FUNCTION "block_hard_delete_fn"();

CREATE TRIGGER "Customer_no_delete"
BEFORE DELETE ON "Customer"
FOR EACH ROW EXECUTE FUNCTION "block_hard_delete_fn"();

CREATE TRIGGER "Membership_no_delete"
BEFORE DELETE ON "Membership"
FOR EACH ROW EXECUTE FUNCTION "block_hard_delete_fn"();

-- ---------------------------------------------------------------------
-- 8. OTP lifecycle guard
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "OtpChallenge_guard_fn"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'ACTIVE' THEN
      RAISE EXCEPTION 'new OTP challenge must be ACTIVE';
    END IF;
    IF NEW."attempts" <> 0 THEN
      RAISE EXCEPTION 'new OTP challenge attempts must be 0';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'OTP challenge is terminal once %', OLD."status";
  END IF;

  IF NEW."phone"       IS DISTINCT FROM OLD."phone"
     OR NEW."purpose"  IS DISTINCT FROM OLD."purpose"
     OR NEW."channel"  IS DISTINCT FROM OLD."channel"
     OR NEW."codeHash" IS DISTINCT FROM OLD."codeHash"
     OR NEW."userId"   IS DISTINCT FROM OLD."userId"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'immutable OTP fields cannot be changed';
  END IF;

  IF NEW."attempts" < OLD."attempts" THEN
    RAISE EXCEPTION 'OTP attempts cannot decrease';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "OtpChallenge_guard"
BEFORE INSERT OR UPDATE ON "OtpChallenge"
FOR EACH ROW EXECUTE FUNCTION "OtpChallenge_guard_fn"();
