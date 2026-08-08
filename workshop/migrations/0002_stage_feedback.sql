CREATE TABLE IF NOT EXISTS stage_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN (
    'starting-survey',
    'attio-setup',
    'naive-summary',
    'coverage-audit',
    'build-system',
    'verify-system',
    'final-survey'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('worked', 'blocked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_stage_feedback_stage ON stage_feedback(stage);
CREATE INDEX IF NOT EXISTS idx_stage_feedback_updated ON stage_feedback(updated_at);
