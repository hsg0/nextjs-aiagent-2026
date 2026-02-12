// /backend/models/aimodels/conversationModel.js
import mongoose from "mongoose";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  12
);

const conversationSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(),
    },
    webUserEmail: { type: String, required: true, index: true },
    webUserName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const conversationModel = mongoose.model(
  "ConversationModel",
  conversationSchema,
  "conversationmodel"
);
export default conversationModel;
