ALTER TABLE audit_events ADD COLUMN actor_id TEXT;
ALTER TABLE audit_events ADD COLUMN actor_name TEXT;
ALTER TABLE audit_events ADD COLUMN entity_version INTEGER;
CREATE TABLE template_imports (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL,
 template_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(workspace_id,fingerprint),
 FOREIGN KEY(workspace_id,template_id) REFERENCES templates(workspace_id,id) ON DELETE CASCADE
);
