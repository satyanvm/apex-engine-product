CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  compile_limit integer,
  run_limit     integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

-- Only the SHA-256 of the session token is stored.
CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL
);

-- One row per engine catalog. The engine key is shared across workspaces, so
-- this table is what makes a catalog belong to a workspace.
CREATE TABLE tools (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  engine_catalog_id  text NOT NULL UNIQUE,
  name               text NOT NULL,
  kind               text NOT NULL,
  base_url           text NOT NULL DEFAULT '',
  node_count         integer NOT NULL DEFAULT 0,
  credential_headers text[] NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tools_workspace_idx ON tools (workspace_id, created_at DESC);

CREATE TABLE flows (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text NOT NULL DEFAULT '',
  prompt             text NOT NULL,
  tool_ids           uuid[] NOT NULL DEFAULT '{}',
  dag                jsonb NOT NULL,
  default_input      jsonb NOT NULL DEFAULT '{}',
  suggested_schedule text,
  revision           integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flows_workspace_idx ON flows (workspace_id, updated_at DESC);

-- A compile's result, held server-side so a saved flow can only ever contain
-- what the engine produced for this workspace.
CREATE TABLE compilations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  flow_id      uuid REFERENCES flows(id) ON DELETE CASCADE,
  prompt       text NOT NULL,
  tool_ids     uuid[] NOT NULL DEFAULT '{}',
  plan         jsonb NOT NULL,
  trace        jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compilations_workspace_idx ON compilations (workspace_id, created_at DESC);

CREATE TABLE schedules (
  id                 uuid PRIMARY KEY,
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  flow_id            uuid NOT NULL UNIQUE REFERENCES flows(id) ON DELETE CASCADE,
  engine_schedule_id text UNIQUE,
  cron               text NOT NULL,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused_quota')),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schedules_workspace_idx ON schedules (workspace_id);

CREATE TABLE runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  flow_id       uuid REFERENCES flows(id) ON DELETE SET NULL,
  flow_name     text NOT NULL,
  engine_run_id text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'queued',
  trigger       text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'schedule')),
  dag           jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX runs_workspace_idx ON runs (workspace_id, created_at DESC);
CREATE INDEX runs_flow_idx ON runs (flow_id, created_at DESC);

CREATE TABLE usage (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  month        date NOT NULL,
  compiles     integer NOT NULL DEFAULT 0,
  runs         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, month)
);
