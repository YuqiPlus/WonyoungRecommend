ALTER TABLE messages ADD COLUMN moderation_decision TEXT;
ALTER TABLE messages ADD COLUMN moderation_reason TEXT;
ALTER TABLE messages ADD COLUMN moderation_model TEXT;
ALTER TABLE messages ADD COLUMN moderated_at TEXT;

CREATE TABLE moderation_daily_usage (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL CHECK(requests >= 0)
);
