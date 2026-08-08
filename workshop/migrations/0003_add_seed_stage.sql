CREATE TABLE stage_feedback_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN (
    'starting-survey',
    'attio-setup',
    'seed-attio',
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

INSERT INTO stage_feedback_next (id, client_id, stage, outcome, created_at, updated_at)
SELECT id, client_id,
  CASE WHEN stage = 'attio-setup' THEN 'seed-attio' ELSE stage END,
  outcome, created_at, updated_at
FROM stage_feedback;

DROP TABLE stage_feedback;
ALTER TABLE stage_feedback_next RENAME TO stage_feedback;

CREATE INDEX idx_stage_feedback_stage ON stage_feedback(stage);
CREATE INDEX idx_stage_feedback_updated ON stage_feedback(updated_at);
