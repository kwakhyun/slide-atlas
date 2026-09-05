CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workspace_members (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('owner','editor','reviewer','viewer')),
 PRIMARY KEY(workspace_id,account_id)
);
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_attempts (
 key TEXT NOT NULL,
 window_start BIGINT NOT NULL,
 count INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(key,window_start)
);
CREATE TABLE IF NOT EXISTS workspace_invites (
 token_hash TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('editor','reviewer','viewer')),
 expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS review_comments (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 deck_id TEXT NOT NULL,
 account_id TEXT NOT NULL REFERENCES accounts(id),
 body TEXT NOT NULL,
 resolved BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(workspace_id,deck_id) REFERENCES decks(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS deck_shares (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 deck_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 data JSONB NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 revoked BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(workspace_id,deck_id) REFERENCES decks(workspace_id,id) ON DELETE CASCADE
);
