
import db from "./db.js";

export function createCallLog(callId, fromUser, toUser, direction, status = "initiated") {
  try {
    db.prepare(`
      INSERT INTO call_logs (call_id, from_user, to_user, direction, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(callId, fromUser, toUser, direction, status);
  } catch (e) {
    console.error("DB insert error:", e);
  }
}

export function linkTwilioSid(callId, sid) {
  try {
    db.prepare(`UPDATE call_logs SET twilio_sid = ? WHERE call_id = ?`).run(sid, callId);
  } catch (e) {
    console.error("DB sid link error:", e);
  }
}

export function updateCallStatusBySid(sid, status) {
  try {
    db.prepare(`
      UPDATE call_logs
      SET status = ?, ended_at = CASE WHEN ? IN ('completed','failed','no-answer') THEN CURRENT_TIMESTAMP ELSE ended_at END
      WHERE twilio_sid = ?
    `).run(status, status, sid);
  } catch (e) {
    console.error("DB status update error:", e);
  }
}

export function updateCallStatusById(callId, status, error = null) {
  try {
    db.prepare(`
      UPDATE call_logs
      SET status = ?, error_message = ?, ended_at = CASE WHEN ? IN ('completed','failed','no-answer') THEN CURRENT_TIMESTAMP ELSE ended_at END
      WHERE call_id = ?
    `).run(status, error, status, callId);
  } catch (e) {
    console.error("DB status update error:", e);
  }
}

export function getCallBySid(sid) {
  return db.prepare("SELECT * FROM call_logs WHERE twilio_sid = ?").get(sid);
}

export function getCallById(callId) {
  return db.prepare("SELECT * FROM call_logs WHERE call_id = ?").get(callId);
}
