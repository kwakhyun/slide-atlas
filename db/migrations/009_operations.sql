CREATE TABLE operations (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 kind TEXT NOT NULL,
 status TEXT NOT NULL,
 items JSONB NOT NULL,
 lease_token TEXT,
 lease_until TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(workspace_id,id)
);
