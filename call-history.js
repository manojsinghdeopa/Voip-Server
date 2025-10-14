import express from "express";
import db from "./db.js";
const router = express.Router();

router.get("/call-logs/:userId", (req, res) => {
  const { userId } = req.params;
  const stmt = db.prepare(`
    SELECT call_id, twilio_sid, from_user, to_user, direction, status, started_at, ended_at
    FROM call_logs
    WHERE from_user = ? OR to_user = ?
    ORDER BY started_at DESC
  `);
  const logs = stmt.all(userId, userId);
  res.json(logs);
});

export default router;
