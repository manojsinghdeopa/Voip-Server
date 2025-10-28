import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!keyPath || !fs.existsSync(keyPath)) {
  console.warn("Firebase service account JSON not found. FCM will fail until configured.");
} else {
  admin.initializeApp({
    credential: admin.credential.cert(keyPath)
  });
}

export async function sendIncomingCallPush(targetToken, callerName, callId) {
  if (!admin.apps.length) {
    console.error("Firebase not initialized. Cannot send push.");
    return;
  }

  const message = {
    token: targetToken,
    android: {
      priority: "high",
      ttl: 0, // immediate delivery, no caching
    },
    data: {
      type: "incoming_call",
      callerName: callerName,
      callId: callId,
      timestamp: Date.now().toString(),
    },
  };


  try {
    const resp = await admin.messaging().send(message);
    console.log("FCM sent:", resp);
  } catch (err) {
    console.error("FCM error:", err);
  }
}
