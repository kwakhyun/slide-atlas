CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS templates (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('overview','comparison','metrics','process','timeline','insight')),
  layout TEXT NOT NULL CHECK (layout IN ('hero','split','metric-grid','steps','timeline','editorial')),
  status TEXT NOT NULL CHECK (status IN ('draft','in_review','approved','rejected')),
  version INTEGER NOT NULL CHECK (version > 0),
  search_text TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS templates_structure_idx ON templates(workspace_id, status, intent, layout);
CREATE INDEX IF NOT EXISTS templates_search_idx ON templates USING GIN (to_tsvector('simple', search_text));
CREATE TABLE IF NOT EXISTS template_versions (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, template_id, version)
);
CREATE INDEX IF NOT EXISTS template_versions_lookup_idx ON template_versions(workspace_id, template_id, version DESC);
INSERT INTO template_versions (workspace_id,template_id,version,data,created_at)
SELECT workspace_id,id,version,data,updated_at FROM templates
ON CONFLICT (workspace_id,template_id,version) DO NOTHING;
CREATE TABLE IF NOT EXISTS decks (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('template','deck','experiment')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_workspace_idx ON audit_events(workspace_id, created_at DESC);
CREATE TABLE IF NOT EXISTS experiments (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id)
);
CREATE TABLE IF NOT EXISTS rate_windows (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, bucket)
);
CREATE TABLE IF NOT EXISTS ai_daily_budget (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 1 CHECK (calls > 0)
);
