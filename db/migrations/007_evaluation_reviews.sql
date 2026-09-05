CREATE TABLE quality_evaluations (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT,
 data JSONB NOT NULL,
 regression BOOLEAN NOT NULL DEFAULT FALSE,
 resolution JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE quality_ratings (
 workspace_id TEXT NOT NULL,
 evaluation_id TEXT NOT NULL,
 reviewer_id TEXT NOT NULL REFERENCES accounts(id),
 reviewer_name TEXT NOT NULL,
 data JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(workspace_id,evaluation_id,reviewer_id),
 FOREIGN KEY(workspace_id,evaluation_id) REFERENCES quality_evaluations(workspace_id,id) ON DELETE CASCADE
);
