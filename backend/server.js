import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import connectDB from "./config/mongoDB.js";
import { createSocketServer } from "./config/socketServer.js";
import { initWebRTCSocketServer } from "./config/webrtcSocketServer.js";

import authRouter from "./routes/auth/authRoutes.js";
import googleGeminiAiRouter from "./routes/googleGeminiAi/googleGeminiAiRoutes.js";
import webrtcRoomRoutes from "./routes/webrtcroutes/roomRoutes.js";
import webrtcMessageRoutes from "./routes/webrtcroutes/messageRoutes.js";
import agoraTokenRoutes from "./routes/webrtcroutes/agoraTokenRoutes.js";

dotenv.config();

connectDB();

const PORT = process.env.PORT || 4040;
const app = express();
const httpServer = http.createServer(app);

app.set("trust proxy", 1);

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://majubee.com',
    'https://www.majubee.com',
  ].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, curl, Postman, etc.)
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Routes
// health check
app.get('/health', (req, res) => {
    res.status(200).json({ message: 'majubee Server is running' });
});

// auth routes
app.use('/api/v1/auth', authRouter);

// google Gemini ai routes
app.use('/api/v1/google-gemini-ai', googleGeminiAiRouter);

// webrtc room + message REST routes
app.use('/webrtc/rooms', webrtcRoomRoutes);
app.use('/webrtc/messages', webrtcMessageRoutes);

// agora token route
app.use('/api/v1/agora', agoraTokenRoutes);

// AI socket (default path /socket.io)
createSocketServer(httpServer, allowedOrigins);

// WebRTC socket (separate path /socket.io-webrtc)
initWebRTCSocketServer(httpServer, { allowedOrigins, socketPath: "/socket.io-webrtc" });

httpServer.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

