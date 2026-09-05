CREATE TABLE IF NOT EXISTS brand_versions (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 version INTEGER NOT NULL,
 data JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(workspace_id,id,version)
);
