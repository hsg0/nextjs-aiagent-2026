import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import webUserModel from "../models/authmodels/usermodel.js";
import Room from "../models/webrtcchatmodels/room.js";
import Message from "../models/webrtcchatmodels/message.js";

dotenv.config();

// ── Cookie parser (same approach as the AI socket server) ────
function parseCookie(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((segment) => {
      const separatorIndex = segment.indexOf("=");
      const key = (separatorIndex === -1 ? segment : segment.slice(0, separatorIndex)).trim();
      const value = (separatorIndex === -1 ? "" : segment.slice(separatorIndex + 1)).trim();
      return [key, value];
    }),
  );
}

// ── WebRTC Socket Server ─────────────────────────────────────
export function initWebRTCSocketServer(httpServer, options = {}) {
  const {
    allowedOrigins = [],
    socketPath = "/socket.io-webrtc",
  } = options;

  const io = new Server(httpServer, {
    path: socketPath,
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true,
    },
  });

  console.log("[webrtcSocket] socket server initialized. path:", socketPath);

  // ── In-memory tracker: which room has an active screen sharer ──
  const activeSharers = new Map(); // roomKey → { socketId, name }

  // ── In-memory tracker: which sockets have camera/mic ready per room ──
  const cameraReadyUsers = new Map(); // roomKey → Set<socketId>

  // ── JWT auth middleware (same as AI socket) ─────────────
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

      const foundUser = await webUserModel.findById(userId).select("_id name email");
      if (!foundUser) return next(new Error("User not found"));

      socket.user = {
        userId: foundUser._id.toString(),
        name: foundUser.name,
        email: foundUser.email,
      };
      next();
    } catch (authError) {
      console.log("[webrtcSocket] auth error:", authError?.message);
      next(new Error("Invalid or expired token"));
    }
  });

  // ── Connection handler ─────────────────────────────────
  io.on("connection", (socket) => {
    console.log("[webrtcSocket] connected:", socket.id, "user:", socket.user?.name);

    // ── Join room ────────────────────────────────────────
    socket.on("room:join", async (payload) => {
      try {
        const { roomKey, userId = "", name, email = "" } = payload || {};
        console.log("[webrtcSocket] room:join", { socketId: socket.id, roomKey, name });

        if (!roomKey || !name) return;

        socket.join(roomKey);

        let room = await Room.findOne({ roomKey });
        if (!room) room = await Room.create({ roomKey });

        // upsert participant by socketId
        const existingIndex = room.participants.findIndex(
          (participant) => participant.socketId === socket.id,
        );
        const participantData = {
          socketId: socket.id,
          userId,
          name,
          email,
          joinedAt: new Date(),
        };

        if (existingIndex >= 0) {
          room.participants[existingIndex] = participantData;
        } else {
          room.participants.push(participantData);
        }

        await room.save();

        io.to(roomKey).emit("room:participants", {
          roomKey,
          participants: room.participants,
        });

        io.to(roomKey).emit("room:notice", {
          roomKey,
          text: `${name} joined the room`,
          ts: Date.now(),
        });

        // If someone is already sharing, notify the new joiner
        const currentSharer = activeSharers.get(roomKey);
        if (currentSharer && currentSharer.socketId !== socket.id) {
          socket.emit("screenshare:started", {
            roomKey,
            sharerSocketId: currentSharer.socketId,
            sharerName: currentSharer.name,
          });
        }
      } catch (error) {
        console.log("[webrtcSocket] room:join error:", error);
      }
    });

    // ── Leave room ───────────────────────────────────────
    socket.on("room:leave", async (payload) => {
      try {
        const { roomKey } = payload || {};
        console.log("[webrtcSocket] room:leave", { socketId: socket.id, roomKey });

        if (!roomKey) return;

        socket.leave(roomKey);

        const room = await Room.findOne({ roomKey });
        if (!room) return;

        const leavingParticipant = room.participants.find(
          (participant) => participant.socketId === socket.id,
        );

        room.participants = room.participants.filter(
          (participant) => participant.socketId !== socket.id,
        );
        await room.save();

        io.to(roomKey).emit("room:participants", {
          roomKey,
          participants: room.participants,
        });

        if (leavingParticipant) {
          io.to(roomKey).emit("room:notice", {
            roomKey,
            text: `${leavingParticipant.name} left the room`,
            ts: Date.now(),
          });
        }

        // If the leaver was the screen sharer, clear and notify
        const roomSharer = activeSharers.get(roomKey);
        if (roomSharer?.socketId === socket.id) {
          activeSharers.delete(roomKey);
          io.to(roomKey).emit("screenshare:stopped", {
            roomKey,
            sharerSocketId: socket.id,
          });
        }

        // Remove from camera-ready set
        const camReady = cameraReadyUsers.get(roomKey);
        if (camReady) {
          camReady.delete(socket.id);
          if (camReady.size === 0) cameraReadyUsers.delete(roomKey);
        }
      } catch (error) {
        console.log("[webrtcSocket] room:leave error:", error);
      }
    });

    // ── Chat send ────────────────────────────────────────
    socket.on("chat:send", async (payload) => {
      try {
        const { roomKey, userId = "", name, email = "", text } = payload || {};
        const trimmedText = String(text || "").trim();

        console.log("[webrtcSocket] chat:send", { roomKey, name, text: trimmedText });

        if (!roomKey || !name || !trimmedText) return;

        const savedMessage = await Message.create({
          roomKey,
          sender: { userId, name, email },
          text: trimmedText,
        });

        io.to(roomKey).emit("chat:new", {
          id: savedMessage._id.toString(),
          roomKey,
          who: "user",
          name,
          email,
          text: savedMessage.text,
          ts: new Date(savedMessage.createdAt).getTime(),
        });
      } catch (error) {
        console.log("[webrtcSocket] chat:send error:", error);
      }
    });

    // ── Screen share: start ───────────────────────────────
    socket.on("screenshare:start", (payload) => {
      const { roomKey } = payload || {};
      if (!roomKey) return;

      // Only one sharer at a time per room
      const currentSharer = activeSharers.get(roomKey);
      if (currentSharer && currentSharer.socketId !== socket.id) {
        socket.emit("screenshare:denied", {
          reason: "Someone is already sharing their screen.",
        });
        return;
      }

      const sharerInfo = {
        socketId: socket.id,
        name: socket.user?.name || "Unknown",
      };
      activeSharers.set(roomKey, sharerInfo);

      console.log("[webrtcSocket] screenshare:start", { roomKey, sharer: socket.id });

      // Broadcast to all OTHER users in the room
      socket.to(roomKey).emit("screenshare:started", {
        roomKey,
        sharerSocketId: socket.id,
        sharerName: socket.user?.name || "Unknown",
      });
    });

    // ── Screen share: stop ────────────────────────────────
    socket.on("screenshare:stop", (payload) => {
      const { roomKey } = payload || {};
      if (!roomKey) return;

      const currentSharer = activeSharers.get(roomKey);
      if (currentSharer?.socketId === socket.id) {
        activeSharers.delete(roomKey);
      }

      console.log("[webrtcSocket] screenshare:stop", { roomKey, sharer: socket.id });

      io.to(roomKey).emit("screenshare:stopped", {
        roomKey,
        sharerSocketId: socket.id,
      });
    });

    // ── WebRTC signaling relay (offer / answer / ICE) ─────
    socket.on("signal:viewer-ready", (payload) => {
      const { targetSocketId } = payload || {};
      if (!targetSocketId) return;
      io.to(targetSocketId).emit("signal:viewer-ready", {
        viewerSocketId: socket.id,
      });
    });

    socket.on("signal:offer", (payload) => {
      const { targetSocketId, sdp } = payload || {};
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit("signal:offer", {
        senderSocketId: socket.id,
        sdp,
      });
    });

    socket.on("signal:answer", (payload) => {
      const { targetSocketId, sdp } = payload || {};
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit("signal:answer", {
        senderSocketId: socket.id,
        sdp,
      });
    });

    socket.on("signal:ice-candidate", (payload) => {
      const { targetSocketId, candidate } = payload || {};
      if (!targetSocketId || !candidate) return;
      io.to(targetSocketId).emit("signal:ice-candidate", {
        senderSocketId: socket.id,
        candidate,
      });
    });

    // ── Camera mesh: readiness + signaling ──────────────
    socket.on("camera:ready", ({ roomKey }) => {
      if (!roomKey) return;

      // Track this user as camera-ready
      if (!cameraReadyUsers.has(roomKey)) {
        cameraReadyUsers.set(roomKey, new Set());
      }
      cameraReadyUsers.get(roomKey).add(socket.id);

      // Notify others in the room that this user is camera-ready
      socket.to(roomKey).emit("camera:user-ready", { socketId: socket.id });

      // Tell this user about all other camera-ready users in the room
      const readySet = cameraReadyUsers.get(roomKey);
      const otherReadyUsers = [...readySet].filter((id) => id !== socket.id);
      if (otherReadyUsers.length > 0) {
        socket.emit("camera:users-ready", { socketIds: otherReadyUsers });
      }

      console.log("[webrtcSocket] camera:ready", { roomKey, socketId: socket.id, totalReady: readySet.size });
    });

    socket.on("camera:offer", (payload) => {
      const { targetSocketId, sdp } = payload || {};
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit("camera:offer", {
        senderSocketId: socket.id,
        sdp,
      });
    });

    socket.on("camera:answer", (payload) => {
      const { targetSocketId, sdp } = payload || {};
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit("camera:answer", {
        senderSocketId: socket.id,
        sdp,
      });
    });

    socket.on("camera:ice-candidate", (payload) => {
      const { targetSocketId, candidate } = payload || {};
      if (!targetSocketId || !candidate) return;
      io.to(targetSocketId).emit("camera:ice-candidate", {
        senderSocketId: socket.id,
        candidate,
      });
    });

    // Relay camera on/off toggle to all others in the room
    socket.on("camera:cam-toggled", (payload) => {
      const { roomKey, camOn } = payload || {};
      if (!roomKey) return;
      socket.to(roomKey).emit("camera:cam-toggled", {
        socketId: socket.id,
        camOn: !!camOn,
      });
    });

    // ── Disconnect cleanup ───────────────────────────────
    socket.on("disconnect", async () => {
      try {
        console.log("[webrtcSocket] disconnected:", socket.id);

        // remove socket from any rooms where it exists
        const roomsWithSocket = await Room.find({
          "participants.socketId": socket.id,
        });

        for (const room of roomsWithSocket) {
          const previousCount = room.participants.length;

          const leavingParticipant = room.participants.find(
            (participant) => participant.socketId === socket.id,
          );

          room.participants = room.participants.filter(
            (participant) => participant.socketId !== socket.id,
          );
          await room.save();

          if (previousCount !== room.participants.length) {
            io.to(room.roomKey).emit("room:participants", {
              roomKey: room.roomKey,
              participants: room.participants,
            });

            if (leavingParticipant) {
              io.to(room.roomKey).emit("room:notice", {
                roomKey: room.roomKey,
                text: `${leavingParticipant.name} disconnected`,
                ts: Date.now(),
              });
            }

            // If the disconnected user was the sharer, clear and notify
            const disconnectedSharer = activeSharers.get(room.roomKey);
            if (disconnectedSharer?.socketId === socket.id) {
              activeSharers.delete(room.roomKey);
              io.to(room.roomKey).emit("screenshare:stopped", {
                roomKey: room.roomKey,
                sharerSocketId: socket.id,
              });
            }

            // Remove from camera-ready set
            const camReady = cameraReadyUsers.get(room.roomKey);
            if (camReady) {
              camReady.delete(socket.id);
              if (camReady.size === 0) cameraReadyUsers.delete(room.roomKey);
            }
          }
        }
      } catch (error) {
        console.log("[webrtcSocket] disconnect cleanup error:", error);
      }
    });
  });

  return io;
}
