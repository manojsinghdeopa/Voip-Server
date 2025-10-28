import Database from "better-sqlite3";
const db = new Database("voip.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE,
  phone_number TEXT UNIQUE,
  fcm_token TEXT
);

CREATE TABLE IF NOT EXISTS call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT UNIQUE,
  twilio_sid TEXT UNIQUE,
  from_user TEXT,
  to_user TEXT,
  direction TEXT,
  status TEXT,
  error_message TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_call_id ON call_logs (call_id);
CREATE INDEX IF NOT EXISTS idx_twilio_sid ON call_logs (twilio_sid);

`);


export default db;
