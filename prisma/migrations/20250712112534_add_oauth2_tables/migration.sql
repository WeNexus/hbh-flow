-- CreateTable
CREATE TABLE "OAuth2AuthState"
(
    "state"      TEXT        NOT NULL,
    "verifier"   TEXT        NOT NULL,
    "provider"   TEXT        NOT NULL,
    "connection" TEXT        NOT NULL,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuth2AuthState_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "OAuth2Token"
(
    "connection" TEXT        NOT NULL,
    "provider"   TEXT        NOT NULL,
    "access"     TEXT        NOT NULL,
    "refresh"    TEXT        NOT NULL,
    "scopes"     TEXT[],
    "expiresAt"  TIMESTAMPTZ NOT NULL,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMPTZ,

    CONSTRAINT "OAuth2Token_pkey" PRIMARY KEY ("provider", "connection")
);
