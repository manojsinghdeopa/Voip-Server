

import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import { connections, callMap } from "./connection-registry.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const WS_PORT = process.env.WS_PORT || 8081;
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);


export function sendToUser(userId, data) {
  const ws = connections.get(userId);
  if (ws && ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(data)); }
    catch (e) { console.error("sendToUser error:", e); }
  }
}

wss.on("connection", (ws) => {

  console.log("Client connected");
  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {

        case "register":
          ws.userId = msg.userId;
          connections.set(msg.userId, ws);
          ws.send(JSON.stringify({ type: "register_success", userId: msg.userId }));
          console.log(`Registered ${msg.userId}`);
          break;


        case "initiate_call": {
          const callId = uuidv4();
          callMap.set(callId, { userId: ws.userId, ws });
          ws.send(JSON.stringify({ type: "call_initiated", callId, to: msg.to }));
          try {
            const res = await fetch(`http://localhost:${process.env.PORT || 8080}/start-call`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callId, to: msg.to, from: msg.from || process.env.TWILIO_PHONE_NUMBER })
            });
            const json = await res.json();
            console.log("start-call response:", json);

            // Map Twilio SID to callId if available
            if (json.sid) {
              const entry = callMap.get(callId) || {};
              entry.twilioSid = json.sid;
              callMap.set(callId, entry);
            }
          } catch (err) {
            console.error("Error starting call:", err);
            ws.send(JSON.stringify({ type: "call_failed", reason: err.message }));
          }
          break;
        }

        case "answer_call": {
          await fetch(`http://localhost:${process.env.PORT || 8080}/connect-call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(msg)
          });
          break;
        }

        case "hangup": {
          await fetch(`http://localhost:${process.env.PORT || 8080}/hangup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(msg)
          });
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "error", message: "Unknown type" }));

      }
    } catch (err) {
      console.error("WS message handling error:", err);
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    }
  });

  ws.on("close", () => {

    if (ws.userId) {
      connections.delete(ws.userId);
      console.log(`${ws.userId} disconnected`);
    }

  });
});
