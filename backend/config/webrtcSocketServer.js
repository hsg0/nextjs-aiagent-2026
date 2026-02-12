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
// Handles: room lifecycle, chat, and Agora UID mapping.
// Media transport (audio/video/screen) is handled entirely by Agora SDK.
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

  // ── In-memory Agora UID mappings per room ───────────────
  // roomKey → Map<socketId, { agoraUid, name }>
  const agoraUidMappings = new Map();

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

        // Prune stale participants whose sockets are no longer connected
        const connectedSocketIds = new Set(io.sockets.sockets.keys());
        const before = room.participants.length;
        room.participants = room.participants.filter(
          (p) => connectedSocketIds.has(p.socketId),
        );
        if (room.participants.length < before) {
          console.log("[webrtcSocket] pruned", before - room.participants.length, "stale participants from", roomKey);

          // Also clean stale entries from agoraUidMappings
          const roomMappings = agoraUidMappings.get(roomKey);
          if (roomMappings) {
            for (const mappedSid of roomMappings.keys()) {
              if (!connectedSocketIds.has(mappedSid)) {
                roomMappings.delete(mappedSid);
              }
            }
            if (roomMappings.size === 0) agoraUidMappings.delete(roomKey);
          }
        }

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

        // Replay existing Agora UID mappings to the newly joined socket
        const roomMappings = agoraUidMappings.get(roomKey);
        if (roomMappings && roomMappings.size > 0) {
          for (const [mappedSocketId, mapping] of roomMappings) {
            socket.emit("agora:uid-map", {
              socketId: mappedSocketId,
              agoraUid: mapping.agoraUid,
              name: mapping.name,
            });
          }
          console.log("[webrtcSocket] replayed", roomMappings.size, "UID mappings to", socket.id);
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

        // Atomically remove participant to avoid VersionError
        const room = await Room.findOneAndUpdate(
          { roomKey },
          { $pull: { participants: { socketId: socket.id } } },
          { new: true },
        );

        if (room) {
          io.to(roomKey).emit("room:participants", {
            roomKey,
            participants: room.participants,
          });

          io.to(roomKey).emit("room:notice", {
            roomKey,
            text: `${socket.user?.name || "Someone"} left the room`,
            ts: Date.now(),
          });
        }

        // Clean up Agora UID mapping for the departing socket
        const roomMappings = agoraUidMappings.get(roomKey);
        if (roomMappings) {
          roomMappings.delete(socket.id);
          if (roomMappings.size === 0) agoraUidMappings.delete(roomKey);
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

    // ── Agora UID announce ───────────────────────────────
    // When a user joins the Agora channel, they broadcast their
    // Agora UID so others can map UID → participant name.
    socket.on("agora:uid-announce", (payload) => {
      const { roomKey, agoraUid } = payload || {};
      if (!roomKey || agoraUid == null) return;

      const userName = socket.user?.name || "Unknown";

      console.log("[webrtcSocket] agora:uid-announce", {
        socketId: socket.id,
        agoraUid,
        name: userName,
      });

      // Store the mapping so late joiners can receive it
      if (!agoraUidMappings.has(roomKey)) {
        agoraUidMappings.set(roomKey, new Map());
      }
      agoraUidMappings.get(roomKey).set(socket.id, { agoraUid, name: userName });

      // Broadcast to everyone in the room (including sender for confirmation)
      io.to(roomKey).emit("agora:uid-map", {
        socketId: socket.id,
        agoraUid,
        name: userName,
      });
    });

    // ── Disconnect cleanup ───────────────────────────────
    socket.on("disconnect", async () => {
      try {
        console.log("[webrtcSocket] disconnected:", socket.id);

        const userName = socket.user?.name || "Someone";

        // Atomically remove this socket from ALL rooms it was in
        const roomsWithSocket = await Room.find({
          "participants.socketId": socket.id,
        });

        for (const roomDoc of roomsWithSocket) {
          const updatedRoom = await Room.findOneAndUpdate(
            { roomKey: roomDoc.roomKey },
            { $pull: { participants: { socketId: socket.id } } },
            { new: true },
          );

          if (updatedRoom) {
            io.to(roomDoc.roomKey).emit("room:participants", {
              roomKey: roomDoc.roomKey,
              participants: updatedRoom.participants,
            });

            io.to(roomDoc.roomKey).emit("room:notice", {
              roomKey: roomDoc.roomKey,
              text: `${userName} disconnected`,
              ts: Date.now(),
            });
          }

          // Clean up Agora UID mapping for the disconnected socket
          const roomMappings = agoraUidMappings.get(roomDoc.roomKey);
          if (roomMappings) {
            roomMappings.delete(socket.id);
            if (roomMappings.size === 0) agoraUidMappings.delete(roomDoc.roomKey);
          }
        }
      } catch (error) {
        console.log("[webrtcSocket] disconnect cleanup error:", error);
      }
    });
  });

  return io;
}
