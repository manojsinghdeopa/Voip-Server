export const connections = new Map(); // userId -> ws
export const callMap = new Map(); // callId -> { userId, ws, twilioSid? }
