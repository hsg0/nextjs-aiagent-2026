import Message from "../../models/webrtcchatmodels/message.js";
import Room from "../../models/webrtcchatmodels/room.js";

export async function listMessages(req, res) {
  try {
    const { roomKey } = req.params;
    const limit = Math.min(Number(req.query.limit || 50), 200);

    console.log("[webrtc][messageController] listMessages:", { roomKey, limit });

    if (!roomKey) {
      return res.status(400).json({ ok: false, message: "Missing roomKey" });
    }

    // Only return messages for the current active session
    const activeRoom = await Room.findOne({ roomKey, isActive: true });
    if (!activeRoom) {
      // No active session → fresh state, no messages to show
      return res.json({ ok: true, messages: [] });
    }

    const messages = await Message.find({
      roomKey,
      sessionId: activeRoom._id.toString(),
    })
      .sort({ createdAt: 1 })
      .limit(limit);

    return res.json({ ok: true, messages });
  } catch (error) {
    console.log("[webrtc][messageController] ❌ error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}