// /backend/models/aimodels/aimodel.js
import mongoose from "mongoose";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 10);

const webUserAiModelSchema = new mongoose.Schema({
    conversationId: {
        type: String,
        default: null,
    },
    webUserEmail: {
        type: String,
        required: true,
    },
    webUserQuestionNanoId: {
        type: String,
        default: () => nanoid()
    },
    webUserQuestionCreatedAt: {
        type: Date,
        default: Date.now,
    },
    webUserQuestion: {
        type: String,
        required: true,
    },
    webUserAnswerByGeminiAi: {
        summary: {
            type: String
        }
    },
    webUserAnswerByGeminiAiCreatedAt: {
        type: Date,
        default: Date.now,
    },
    googleGeminiAiModelUsed: {
        type: String,
        default: "gemini-2.5-flash",
    },
}, { timestamps: true });

webUserAiModelSchema.index({ conversationId: 1, webUserEmail: 1 });

const webUserAiModel = mongoose.model("WebUserAiModel", webUserAiModelSchema, "webuseraimodel");
export default webUserAiModel;