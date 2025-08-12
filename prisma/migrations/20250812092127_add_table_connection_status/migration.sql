-- CreateTable
CREATE TABLE "public"."ConnectionStatus"
(
    "provider"   TEXT        NOT NULL,
    "connection" TEXT        NOT NULL,
    "working"    BOOLEAN     NOT NULL DEFAULT true,
    "reason"     TEXT,
    "testedAt"   TIMESTAMPTZ,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMPTZ,

    CONSTRAINT "ConnectionStatus_pkey" PRIMARY KEY ("provider", "connection")
);
