import Room from "../../models/webrtcchatmodels/room.js";

export async function getOrCreateRoom(req, res) {
  try {
    const { roomKey } = req.params;

    console.log("[webrtc][roomController] getOrCreateRoom:", roomKey);

    if (!roomKey) {
      return res.status(400).json({ ok: false, message: "Missing roomKey" });
    }

    let room = await Room.findOne({ roomKey });

    if (!room) {
      room = await Room.create({ roomKey });
      console.log("[webrtc][roomController] ✅ created room:", roomKey);
    }

    return res.json({ ok: true, room });
  } catch (error) {
    console.log("[webrtc][roomController] ❌ error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

export async function getParticipants(req, res) {
  try {
    const { roomKey } = req.params;

    console.log("[webrtc][roomController] getParticipants:", roomKey);

    if (!roomKey) {
      return res.status(400).json({ ok: false, message: "Missing roomKey" });
    }

    const room = await Room.findOne({ roomKey });
    if (!room) {
      return res.status(404).json({ ok: false, message: "Room not found" });
    }

    return res.json({ ok: true, participants: room.participants || [] });
  } catch (error) {
    console.log("[webrtc][roomController] ❌ error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}