// user-router.js
import express from "express";
import db from "./db.js";
import { registerUser } from "./user-service.js";

const router = express.Router();

/**
 * POST /register-user
 * Registers or updates a user in the DB
 * body: { userId, phoneNumber, fcmToken }
 */
router.post("/register-user", (req, res) => {
  const { userId, phoneNumber, fcmToken } = req.body;

  if (!userId || !phoneNumber || !fcmToken) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }

  try {
    registerUser(userId, phoneNumber, fcmToken);
    console.log(`✅ Registered user: ${userId} (${phoneNumber})`);
    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.error("❌ Register user error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
