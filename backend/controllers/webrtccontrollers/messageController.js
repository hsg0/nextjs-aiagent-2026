import Message from "../../models/webrtcchatmodels/message.js";

export async function listMessages(req, res) {
  try {
    const { roomKey } = req.params;
    const limit = Math.min(Number(req.query.limit || 50), 200);

    console.log("[webrtc][messageController] listMessages:", { roomKey, limit });

    if (!roomKey) {
      return res.status(400).json({ ok: false, message: "Missing roomKey" });
    }

    const messages = await Message.find({ roomKey })
      .sort({ createdAt: 1 })
      .limit(limit);

    return res.json({ ok: true, messages });
  } catch (error) {
    console.log("[webrtc][messageController] ❌ error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}