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
  call_id TEXT,
  twilio_sid TEXT,
  from_user TEXT,
  to_user TEXT,
  direction TEXT,
  status TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);
`);

export default db;
