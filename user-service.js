import db from "./db.js";

export function registerUser(userId, phoneNumber, fcmToken) {
  const stmt = db.prepare(`
    INSERT INTO users (user_id, phone_number, fcm_token)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      phone_number = excluded.phone_number,
      fcm_token = excluded.fcm_token
  `);
  stmt.run(userId, phoneNumber, fcmToken);
}

export function getUserByPhone(phoneNumber) {
  const stmt = db.prepare("SELECT * FROM users WHERE phone_number = ?");
  return stmt.get(phoneNumber);
}

export function getUser(userId) {
  const stmt = db.prepare("SELECT * FROM users WHERE user_id = ?");
  return stmt.get(userId);
}

export function getUserToken(userId) {
  const stmt = db.prepare("SELECT fcm_token FROM users WHERE user_id = ?");
  const r = stmt.get(userId);
  return r ? r.fcm_token : null;
}
