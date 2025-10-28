import express from "express";
import dotenv from "dotenv";
import userRouter from "./user-router.js";
import callHandler from "./call-handler.js";
import callHistory from "./call-history.js";
import "./signaling-server.js"; // starts WS server
dotenv.config();

const app = express();
app.use(express.json());
app.use("/", callHandler);
app.use("/api", userRouter);
app.use("/api", callHistory);
app.use((err, req, res, next) => {
  console.error("🔥 Global error handler:", err);
  res.status(500).json({ success: false, error: err.message });
});


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`HTTP server running on http://localhost:${PORT}`));
