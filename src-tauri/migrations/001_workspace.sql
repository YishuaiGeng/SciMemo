CREATE TABLE IF NOT EXISTS local_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO local_meta(key,value) VALUES ('revision','0');
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('paper','note','venue','deadline')),
  body TEXT NOT NULL CHECK(json_valid(body))
);
CREATE TABLE IF NOT EXISTS operational_state (
  key TEXT PRIMARY KEY, body TEXT NOT NULL CHECK(json_valid(body))
);
PRAGMA user_version = 1;
