import express from "express";
import dotenv from "dotenv";
import callHandler from "./call-handler.js";
import callHistory from "./call-history.js";
import "./signaling-server.js"; // starts WS server
dotenv.config();

const app = express();
app.use(express.json());
app.use("/", callHandler);
app.use("/api", callHistory);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));
