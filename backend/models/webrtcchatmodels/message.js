import mongoose from "mongoose";

const webDb = mongoose.connection.useDb("webrtcchat");

const messageSchema = new mongoose.Schema(
  {
    roomKey: { type: String, required: true, index: true },
    sender: {
      userId: { type: String, default: "" },
      name: { type: String, required: true },
      email: { type: String, default: "" },
    },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

export default webDb.model("WebRTC_Message", messageSchema);