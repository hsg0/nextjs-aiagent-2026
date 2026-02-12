// /backend/controllers/aicontroller/ai.js
import googleGeminiAi from "../../config/googleGeminiAi.js";
import webTransporter from "../../config/brevo.js";
import aimodel from "../../models/aimodels/aimodel.js";
import Conversation from "../../models/aimodels/conversationModel.js";
import { customAlphabet } from "nanoid";
import dotenv from "dotenv";

dotenv.config();

const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 12);
const SENDER_EMAIL = process.env.SENDER_EMAIL || "majubee84@gmail.com";

function escapeHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const askSkullFIreQuestionsController = async (req, res) => {
  try {
    const { question } = req.body;
    const response = await googleGeminiAi.models.generateContent({
      model: "gemini-2.5-flash",
      contents: question,
      config: {
        systemInstruction:
          "You are Skull Fire, a helpful voice assistant. Keep responses concise and natural for spoken conversation.",
      },
    });
    const answer = response?.text ?? "";
    return res.status(200).json({ success: true, answer });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const conversationStart = async (req, res) => {
  try {
    const email = req.user?.email;
    const name = req.user?.name ?? "User";
    if (!email) return res.status(401).json({ success: false, message: "User email required" });

    const conversationId = nanoid();
    await Conversation.create({
      conversationId,
      webUserEmail: email,
      webUserName: name,
      startedAt: new Date(),
    });

    await webTransporter.sendMail({
      from: SENDER_EMAIL,
      to: email,
      subject: "Skull Fire — Conversation started",
      text: `Hi ${name}, your Skull Fire voice conversation has started.`,
      html: `<p>Hi ${name},</p><p>Your Skull Fire voice conversation has started. Talk to your assistant in the app.</p>`,
    });

    return res.status(200).json({ success: true, conversationId });
  } catch (error) {
    console.error("conversationStart error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to start conversation",
      error: error.message,
    });
  }
};

export const conversationEnd = async (req, res) => {
  try {
    const email = req.user?.email;
    const name = req.user?.name ?? "User";
    const { conversationId } = req.body;

    if (!email) return res.status(401).json({ success: false, message: "User email required" });
    if (!conversationId) return res.status(400).json({ success: false, message: "conversationId required" });

    const convo = await Conversation.findOne({ conversationId, webUserEmail: email }).lean();
    if (!convo) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const endedAt = new Date();
    await Conversation.updateOne(
      { conversationId, webUserEmail: email },
      { $set: { status: "ended", endedAt } }
    );

    const turns = await aimodel
      .find({ conversationId, webUserEmail: email })
      .sort({ webUserQuestionCreatedAt: 1 })
      .lean();

    const summary =
      turns.length === 0
        ? "No exchanges in this conversation."
        : turns
            .map((t, i) => {
              const q = t.webUserQuestion || "(no question)";
              const a = t.webUserAnswerByGeminiAi?.summary || "(no answer)";
              return `Q${i + 1}: ${q}\nA${i + 1}: ${a}`;
            })
            .join("\n\n");

    await webTransporter.sendMail({
      from: SENDER_EMAIL,
      to: email,
      subject: "Skull Fire — Conversation ended",
      text: `Hi ${name}, your Skull Fire conversation has ended.\n\nSummary:\n${summary}`,
      html: `<p>Hi ${name},</p><p>Your Skull Fire conversation has ended.</p><pre style="white-space:pre-wrap;">${escapeHtml(summary)}</pre>`,
    });

    return res.status(200).json({ success: true, message: "Conversation ended" });
  } catch (error) {
    console.error("conversationEnd error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to end conversation",
      error: error.message,
    });
  }
};
