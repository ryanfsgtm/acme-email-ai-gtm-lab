CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('start', 'end')),
  role TEXT,
  familiarity INTEGER NOT NULL CHECK (familiarity BETWEEN 1 AND 5),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
  tools_json TEXT NOT NULL DEFAULT '[]',
  goal TEXT,
  confidence_change TEXT CHECK (confidence_change IN ('increased', 'same', 'decreased')),
  likely_use INTEGER CHECK (likely_use BETWEEN 1 AND 5),
  most_valuable TEXT,
  takeaway TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_survey_phase ON survey_responses(phase);
CREATE INDEX IF NOT EXISTS idx_survey_updated ON survey_responses(updated_at);
