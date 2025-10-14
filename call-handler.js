import express from "express";
import twilio from "twilio";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import db from "./db.js";
import { sendIncomingCallPush } from "./fcm.js";
import { getUserByPhone, getUser } from "./user-service.js";
import { connections } from "./connection-registry.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const router = express.Router();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VoiceResponse = twilio.twiml.VoiceResponse;

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

// Start a real outbound call via Twilio
router.post("/start-call", async (req, res) => {
  const { to, from, callId } = req.body;
  try {
    const call = await client.calls.create({
      to,
      from,
      url: "https://handler.twilio.com/twiml/EHd84aaf5d7cbc581e6bb9e9ba48ac8e9a", // replace with your TwiML or Twiml Bin
      statusCallback: `http://localhost:${process.env.PORT || 8080}/twilio-status`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"]
    });

    // Save call log
    const sid = call.sid;
    db.prepare(`
      INSERT INTO call_logs (call_id, twilio_sid, from_user, to_user, direction, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(callId, sid, "system", to, "outbound", "initiated");

    res.json({ success: true, sid: sid });
  } catch (err) {
    console.error("start-call error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Twilio webhooks for call status updates
router.post("/twilio-status", (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log("Twilio status:", CallSid, CallStatus);
  // Update call_logs by twilio_sid
  const stmt = db.prepare("UPDATE call_logs SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE twilio_sid = ?");
  stmt.run(CallStatus, CallSid);

  // Optionally notify connected user by mapping twilio_sid -> callId (not implemented fully)
  // A simple brute-force: find call with twilio_sid
  const callRow = db.prepare("SELECT * FROM call_logs WHERE twilio_sid = ?").get(CallSid);
  if (callRow) {
    // if caller is mapped to a user, notify via WS
    // For outbound: from_user = system, to_user = phone number (not always a user)
    // For inbound bridging flows, you'd have to save the app user id in row and use connections map.
    const userId = callRow.to_user; // adjust as per mapping
    const ws = connections.get(userId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "call_status", callId: callRow.call_id, status: CallStatus }));
    }
  }

  res.sendStatus(200);
});

// Incoming calls from Twilio (PSTN -> Twilio -> webhook)
router.post("/twilio-inbound", async (req, res) => {
  const { From, To } = req.body;
  console.log(`Inbound call ${From} -> ${To}`);
  const user = getUserByPhone(To);
  const callId = uuidv4();

  if (!user) {
    console.log("Unknown destination number -> reject");
    const twiml = new VoiceResponse();
    twiml.reject();
    return res.type("text/xml").send(twiml.toString());
  }

  // Save call record
  db.prepare(`
    INSERT INTO call_logs (call_id, twilio_sid, from_user, to_user, direction, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(callId, null, From, user.user_id, "inbound", "ringing");

  // Send push (FCM) if token exists
  if (user.fcm_token) {
    await sendIncomingCallPush(user.fcm_token, From, callId);
  }

  // Also if user is connected via websocket, notify directly
  const ws = connections.get(user.user_id);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: "incoming_call", from: From, to: To, callId }));
  }

  // Respond Twilio with waiting message
  const twiml = new VoiceResponse();
  twiml.say("Please hold while we try to connect you.");
  res.type("text/xml").send(twiml.toString());

  // Auto-no-answer after 20s if still ringing
  setTimeout(() => {
    const cur = db.prepare("SELECT status FROM call_logs WHERE call_id = ?").get(callId);
    if (cur && cur.status === "ringing") {
      db.prepare("UPDATE call_logs SET status = ? WHERE call_id = ?").run("no-answer", callId);
      console.log(`Auto-marked no-answer for ${callId}`);
      // if Twilio call is active you may hangup via Twilio API using twilio SID (if available)
    }
  }, 20000);
});

// Endpoint to connect inbound call to an app / number (when caller accepts)
router.post("/connect-call", async (req, res) => {
  const { callId, userId } = req.body;
  console.log(`Connect call ${callId} for user ${userId}`);
  // For production connect inbound call to the app via TwiML <Dial><Client>userId</Client></Dial>
  // Example TwiML response:
  const twiml = new VoiceResponse();
  const dial = twiml.dial();
  // If you are using Twilio Client (Programmable Voice SDK) you can dial a client identity:
  dial.client(userId);
  res.type("text/xml").send(twiml.toString());
});

// Hang up call by callId (optionally using Twilio SID)
router.post("/hangup", async (req, res) => {
  const { callId } = req.body;
  // Update DB and call Twilio to hang up if needed (requires twilio SID)
  const row = db.prepare("SELECT * FROM call_logs WHERE call_id = ?").get(callId);
  if (row && row.twilio_sid) {
    try {
      await client.calls(row.twilio_sid).update({ status: "completed" });
      db.prepare("UPDATE call_logs SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE call_id = ?").run("completed", callId);
      return res.json({ success: true });
    } catch (err) {
      console.error("hangup error", err);
      return res.status(500).json({ error: err.message });
    }
  } else {
    db.prepare("UPDATE call_logs SET status = ? WHERE call_id = ?").run("completed", callId);
    return res.json({ success: true });
  }
});

export default router;
