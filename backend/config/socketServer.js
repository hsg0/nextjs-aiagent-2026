import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import webUserModel from "../models/authmodels/usermodel.js";
import Conversation from "../models/aimodels/conversationModel.js";
import googleGeminiAi from "./googleGeminiAi.js";
import aimodel from "../models/aimodels/aimodel.js";

dotenv.config();

const SKULL_FIRE_SYSTEM = "You are Skull Fire, a helpful voice assistant. Keep responses concise and natural for spoken conversation.";

function parseCookie(cookieHeader) {
    if (!cookieHeader) return {};
    return Object.fromEntries(
        cookieHeader.split(";").map((s) => {
            const i = s.indexOf("=");
            const key = (i === -1 ? s : s.slice(0, i)).trim();
            const val = (i === -1 ? "" : s.slice(i + 1)).trim();
            return [key, val];
        })
    );
}

export function createSocketServer(httpServer, allowedOrigins) {
    const io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins.length ? allowedOrigins : true,
            credentials: true,
        },
    });

    io.use(async (socket, next) => {
        const cookieHeader = socket.handshake.headers.cookie;
        const cookies = parseCookie(cookieHeader);
        let token = cookies?.token;
        if (!token && socket.handshake.auth?.token) {
            token = socket.handshake.auth.token;
        }
        if (!token) {
            return next(new Error("Unauthorized: no token"));
        }
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            const userId = payload?.webUserId;
            if (!userId) return next(new Error("Invalid token"));
            const user = await webUserModel.findById(userId).select("_id name email");
            if (!user) return next(new Error("User not found"));
            socket.user = {
                userId: user._id.toString(),
                name: user.name,
                email: user.email,
            };
            next();
        } catch (err) {
            next(new Error("Invalid or expired token"));
        }
    });

    const COOLDOWN_429_MS = 30 * 1000; // 30 seconds after a 429 before allowing another request
    const MIN_INTERVAL_MS = 6000;      // minimum 6 seconds between Gemini calls (gives Gemini breathing room)

    io.on("connection", (socket) => {
        const room = `user:${socket.user.email}`;
        socket.join(room);
        socket.room = room;

        socket._abortController = null;
        socket._isGenerating = false;
        socket._last429At = null;
        socket._lastGeminiCallAt = null;

        socket.on("stop_generation", () => {
            if (socket._abortController) {
                socket._abortController.abort();
            }
        });

        socket.on("user_utterance", async (payload) => {
            const { conversationId, text } = payload || {};
            if (!text || typeof text !== "string") {
                socket.emit("ai_error", { message: "Missing or invalid text" });
                return;
            }
            const email = socket.user?.email;
            if (!email) {
                socket.emit("ai_error", { message: "Not authenticated" });
                return;
            }
            if (!conversationId || typeof conversationId !== "string") {
                socket.emit("ai_error", { message: "Conversation ID required" });
                return;
            }
            const convo = await Conversation.findOne({
                conversationId: conversationId.trim(),
                webUserEmail: email,
            }).lean();
            if (!convo) {
                socket.emit("ai_error", { message: "Conversation not found" });
                return;
            }
            if (convo.status !== "active") {
                socket.emit("ai_error", { message: "Conversation is no longer active" });
                return;
            }
            if (socket._isGenerating) {
                socket.emit("ai_busy", { reason: "generating", retryAfterMs: 3000 });
                return;
            }
            if (socket._last429At && Date.now() - socket._last429At < COOLDOWN_429_MS) {
                const remaining = COOLDOWN_429_MS - (Date.now() - socket._last429At);
                socket.emit("ai_busy", { reason: "rate_limit", retryAfterMs: remaining });
                return;
            }
            if (socket._lastGeminiCallAt && Date.now() - socket._lastGeminiCallAt < MIN_INTERVAL_MS) {
                const remaining = MIN_INTERVAL_MS - (Date.now() - socket._lastGeminiCallAt);
                socket.emit("ai_busy", { reason: "cooldown", retryAfterMs: remaining });
                return;
            }
            socket._isGenerating = true;
            socket._lastGeminiCallAt = Date.now();
            socket._abortController = new AbortController();
            const signal = socket._abortController.signal;
            let fullText = "";
            try {
                const stream = await googleGeminiAi.models.generateContentStream({
                    model: "gemini-2.5-flash",
                    contents: text.trim(),
                    config: {
                        systemInstruction: SKULL_FIRE_SYSTEM,
                        abortSignal: signal,
                    },
                });
                for await (const chunk of stream) {
                    if (signal.aborted) break;
                    const part = chunk?.text ?? "";
                    if (part) {
                        fullText += part;
                        socket.emit("ai_token", { token: part });
                    }
                }
                if (signal.aborted) {
                    socket.emit("ai_done", { answer: fullText, truncated: true });
                    return;
                }
                socket.emit("ai_done", { answer: fullText });
                if (conversationId && fullText) {
                    await aimodel.create({
                        conversationId,
                        webUserEmail: email,
                        webUserQuestion: text.trim(),
                        webUserAnswerByGeminiAi: { summary: fullText },
                        googleGeminiAiModelUsed: "gemini-2.5-flash",
                    }).catch((err) => console.error("aimodel save error:", err));
                }
            } catch (err) {
                if (err.name === "AbortError") return;
                console.error("user_utterance error:", err);
                if (err.status === 429) {
                    socket._last429At = Date.now();
                }
                let userMessage = "Something went wrong. Please try again.";
                const msg = err.message || "";
                if (err.status === 429 || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
                    userMessage = "Rate limit exceeded. Please wait a moment before speaking again.";
                } else if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|connection/i.test(msg)) {
                    userMessage = "Connection problem. Please try again in a moment.";
                }
                socket.emit("ai_error", { message: userMessage });
            } finally {
                socket._abortController = null;
                socket._isGenerating = false;
            }
        });
    });

    return io;
}
