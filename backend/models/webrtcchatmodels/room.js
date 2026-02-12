import mongoose from "mongoose";

const webDb = mongoose.connection.useDb("webrtcchat"); 
// If you already use a specific DB name, keep it consistent.
// If you want it to live in your existing DB, remove useDb and just use mongoose.model.

const participantSchema = new mongoose.Schema(
  {
    socketId: { type: String, default: "", index: true },
    userId: { type: String, default: "" },
    name: { type: String, required: true },
    email: { type: String, default: "" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    roomKey: { type: String, required: true, index: true },
    createdBy: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    participants: { type: [participantSchema], default: [] },
  },
  { timestamps: true }
);

// Compound index for the common query: find active room by roomKey
roomSchema.index({ roomKey: 1, isActive: 1 });

export default webDb.model("WebRTC_Room", roomSchema);