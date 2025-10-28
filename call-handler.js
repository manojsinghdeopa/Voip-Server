import express from "express";
import twilio from "twilio";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import db from "./db.js";
import { sendIncomingCallPush } from "./fcm.js";
import { getUserByPhone, getUser } from "./user-service.js";
import { connections } from "./connection-registry.js";
import { v4 as uuidv4 } from "uuid";
import { createCallLog, linkTwilioSid, updateCallStatusById, updateCallStatusBySid, getCallById, getCallBySid } from "./call-service.js";

dotenv.config();
const router = express.Router();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VoiceResponse = twilio.twiml.VoiceResponse;

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));




// Start a outbound call
router.post("/start-call", async (req, res) => {
  const { to, from } = req.body;
  const callId = uuidv4();

  // 1. Create initial call record before contacting Twilio
  createCallLog(callId, from, to, "outbound", "initiated");

  try {
    const call = await client.calls.create({
      to,
      from,
      url: "https://handler.twilio.com/twiml/EHd84aaf5d7cbc581e6bb9e9ba48ac8e9a", // replace with your TwiML or Twiml Bin
      statusCallback: `${process.env.PUBLIC_URL}/twilio-status` || `http://localhost:${process.env.PORT || 8080}/twilio-status`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"]
    });

    // 2. Store Twilio SID ↔ call_id mapping
    linkTwilioSid(callId, call.sid);

    console.log(`📞 Outbound call started: ${call.sid} <-> ${callId}`);
    res.json({ success: true, callId, sid: call.sid });


  } catch (err) {
    console.error("❌ Twilio call initiation failed:", err.message);
    updateCallStatusById(callId, "failed", err.message);
    res.status(500).json({ success: false, callId, error: err.message });
  }
});




// Twilio webhooks for call status updates
router.post("/twilio-status", (req, res) => {

  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`📡 Twilio callback: ${CallSid} -> ${CallStatus}`);

  try {
    const call = getCallBySid(CallSid);
    if (!call) {
      console.warn(`⚠️ Unknown Twilio SID: ${CallSid}`);
      updateCallStatusById(CallSid, CallStatus);
      return res.sendStatus(200);
    }

    updateCallStatusBySid(CallSid, CallStatus);
    console.log(`✅ Updated ${call.call_id} (${CallSid}) -> ${CallStatus}`);

    const ws = connections.get(call.to_user);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "call_status", callId: call.call_id, status: CallStatus }));
    }

    res.sendStatus(200);

  } catch (e) {
    console.error("❌ Error processing status:", e);
    res.status(500).json({ error: e.message });
  }

});




// Twilio webhook for Incoming PSTN call
router.post("/twilio-inbound", async (req, res) => {
  const { From, To } = req.body;
  console.log(`📞 Incoming Twilio call: ${From} → ${To}`);

  // 1. Find the registered user mapped to this Twilio number
  const user = getUserByPhone(To);

  if (!user) {
    console.warn("⚠️ No app user found for number", To);
    const twiml = new VoiceResponse();
    twiml.say("This number is not available. Goodbye.");
    twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }

  // 2. Create a call record in DB
  const callId = uuidv4();
  db.prepare(`
    INSERT INTO call_logs (call_id, from_user, to_user, direction, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(callId, From, user.user_id, "inbound", "ringing");

  // 3. Notify the app user via FCM push
  if (user.fcm_token) {
    await sendIncomingCallPush(user.fcm_token, From, callId);
    console.log(`📲 Sent incoming call push to ${user.user_id}`);
  }

  // 4. (Optional) Also notify the app in real-time if connected via WebSocket
  const ws = connections.get(user.user_id);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      type: "incoming_call",
      from: From,
      to: To,
      callId: callId
    }));
    console.log(`🔔 Live incoming call sent via WebSocket to ${user.user_id}`);
  }

  // 5. Tell Twilio to wait while app user decides
  const twiml = new VoiceResponse();
  twiml.say("Please hold while we connect your call.");
  res.type("text/xml").send(twiml.toString());

  // 6. Auto-expire ringing call after 50 seconds if no answer
  setTimeout(() => {
    const call = db.prepare("SELECT status FROM call_logs WHERE call_id = ?").get(callId);
    if (call?.status === "ringing") {
      db.prepare("UPDATE call_logs SET status = ? WHERE call_id = ?").run("no-answer", callId);
      console.log(`⏰ Auto-marked no-answer for ${callId}`);
    }
  }, 50000);

});





// connect inbound call (when caller accepts)
router.post("/connect-call", async (req, res) => {
  const { callId, userId } = req.body;
  console.log(`Connect call ${callId} for user ${userId}`);

  const twiml = new VoiceResponse();
  const dial = twiml.dial();
  dial.client(userId); // dial.number("+15550001111");
  res.type("text/xml").send(twiml.toString());

});



// Hang up call by callId (optionally using Twilio SID)
router.post("/hangup", async (req, res) => {
  const { callId } = req.body;
  try {
    const call = getCallById(callId);
    if (!call) {
      return res.status(404).json({ success: false, message: "Call not found" });
    }

    if (call.twilio_sid) {
      await client.calls(call.twilio_sid).update({ status: "completed" });
    }

    updateCallStatusById(callId, "completed");
    res.json({ success: true, message: "Call ended successfully" });

  } catch (err) {
    console.error("❌ Hangup error:", err.message);
    updateCallStatusById(callId, "failed", err.message);
    res.status(500).json({ success: false, error: err.message });
  }

});

export default router;

