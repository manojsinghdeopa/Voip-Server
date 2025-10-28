# VoIP Backend (VoipServer)

Lightweight Node.js backend for handling VoIP signalling, call lifecycle, Twilio integration, and push notifications (FCM). Uses Express for HTTP endpoints, ws for WebSocket signaling, Twilio for PSTN calls, and better-sqlite3 for a simple call/user store.

## Quick facts

- Project name: `voip-backend`
- Language: Node.js (ES modules)
- Main entry: `server.js` (start with `npm start`)
- HTTP server default port: `PORT` (default 8080)
- WebSocket server default port: `WS_PORT` (default 8081)
- DB: `better-sqlite3` using `voip.db` in the repo root

## Features

- WebSocket-based app signaling (register users, initiate/answer/hangup)
- HTTP endpoints for starting/outbound calls, Twilio webhooks, incoming call handling, and call logs
- Twilio integration for PSTN calls (outbound + inbound webhook handling)
- FCM (Firebase) push for notifying app users about incoming PSTN calls
- Simple persistent storage of users and call logs in SQLite (`voip.db`)

## Requirements

- Node.js 18+ (or modern Node with ESM support)
- A Twilio account (for PSTN integration): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- (Optional) Firebase service account JSON for FCM push notifications

## Installation

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root (see example below).

## Environment variables (.env)

The app reads configuration via `dotenv`. Typical values:

- PORT=8080                # HTTP server port (default 8080)
- WS_PORT=8081             # WebSocket server port (default 8081)
- TWILIO_ACCOUNT_SID=...   # Twilio account SID
- TWILIO_AUTH_TOKEN=...    # Twilio auth token
- TWILIO_PHONE_NUMBER=...  # Twilio phone number (E.164) used as caller ID
- PUBLIC_URL=http://example.com  # Public URL/Tunnel used for Twilio callbacks (optional)
- FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json  # required for FCM

Example `.env` (do not commit secrets):

```text
PORT=8080
WS_PORT=8081
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+15551234567
PUBLIC_URL=http://your-public-url
FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json
```

## Start the server

```bash
npm start
# or: node server.js
```

This starts the HTTP API and also imports `signaling-server.js` which starts the WebSocket server on `WS_PORT`.

## Important files and responsibilities

- `server.js` - Express HTTP server setup and mounts routers; loads `signaling-server.js` which launches the WS server.
- `signaling-server.js` - WebSocket server (ws). Handles registration, initiating calls from app clients, and forwards to HTTP endpoints.
- `call-handler.js` - Express router that provides endpoints for Twilio integration and call control (e.g. `/start-call`, `/twilio-status`, `/twilio-inbound`, `/connect-call`, `/hangup`). Mounted at root (`/`).
- `user-router.js` - `/api/register-user` endpoint to register users and their FCM tokens.
- `call-history.js` - `/api/call-logs/:userId` to fetch call history for a user.
- `user-service.js`, `call-service.js` - database/service helpers for users and calls.
- `db.js` - initializes `better-sqlite3` database `voip.db` and creates tables.
- `connection-registry.js` - in-memory maps for active WebSocket connections and active call mappings.
- `fcm.js` - Firebase Admin SDK wrapper for sending incoming-call pushes.

## HTTP Endpoints (overview)

- POST /start-call
  - Start an outbound PSTN call via Twilio. Body: { to, from }

- POST /twilio-status
  - Twilio status callback webhook (updates call log status).

- POST /twilio-inbound
  - Twilio will POST here for incoming calls; app user is notified via FCM + WebSocket.

- POST /connect-call
  - Used to connect an inbound call to a client (returns TwiML dial to client id).

- POST /hangup
  - End a call by callId (and Twilio SID if present).

- POST /api/register-user
  - Register or update app user (body: { userId, phoneNumber, fcmToken }).

- GET /api/call-logs/:userId
  - Returns call logs where the user is caller or callee.

Note: `call-handler.js` endpoints are mounted at the application root by `server.js`.

## WebSocket protocol (signaling)

Connect to the WS server (default):

```
ws://localhost:8081
```

Typical messages from the client:

- Register your client:

```json
{ "type": "register", "userId": "Manoj" }
```

- Initiate an outbound call from app client (proxied to `/start-call`):

```json
{ "type": "initiate_call", "to": "+15550001111", "from": "+15552223333" }
```

- Answer a call (invokes `/connect-call`):

```json
{ "type": "answer_call", "callId": "<call-id>", "userId": "Manoj" }
```

- Hangup:

```json
{ "type": "hangup", "callId": "<call-id>" }
```

The server sends JSON messages back for events like `register_success`, `incoming_call`, `call_initiated`, `call_failed`, and `call_status`.

## Example curl flows

Register a user:

```bash
curl -X POST http://localhost:8080/api/register-user \
  -H 'Content-Type: application/json' \
  -d '{"userId":"Manoj","phoneNumber":"+15550001111","fcmToken":"<token>"}'
```

Start an outbound call (server will create DB entry and call Twilio):

```bash
curl -X POST http://localhost:8080/start-call \
  -H 'Content-Type: application/json' \
  -d '{"to":"+15550002222","from":"+15550001111"}'
```

Fetch call logs for a user:

```bash
curl http://localhost:8080/api/call-logs/alice
```

## Twilio configuration notes

- Configure Twilio webhooks to point to your `PUBLIC_URL` (or ngrok/localtunnel) for these paths:
  - `/twilio-status` (POST) - status callbacks
  - `/twilio-inbound` (POST) - incoming call webhook (voice)

- The outbound call uses a TwiML URL in the code; replace the placeholder TwiML URL in `call-handler.js` with your own TwiML or Twiml Bin.

## Firebase / FCM

- To enable push notifications, set `FIREBASE_SERVICE_ACCOUNT` to the path of your Firebase service account JSON.
- If the file is missing, the server will warn and FCM calls will be skipped (see `fcm.js`).

## Notes, limitations, and next steps

- This is a lightweight example backend intended for development and testing. It stores state in a local SQLite file (`voip.db`). For production use, migrate to a managed DB, secure secrets, and add auth.
- Add HTTPS for public endpoints (ngrok/tunnel for dev).
- Add unit/integration tests and example clients for the WebSocket signaling protocol.
- Consider adding graceful shutdown and better error handling around Twilio webhooks.

## Troubleshooting

- If FCM logs complain about missing service account, ensure `FIREBASE_SERVICE_ACCOUNT` points to the JSON file and the file is accessible.
- If Twilio callbacks aren't received, make sure `PUBLIC_URL` or your tunneling tool is configured and Twilio webhook URLs are set.

## License

MIT-style (project doesn't include an explicit license file).

