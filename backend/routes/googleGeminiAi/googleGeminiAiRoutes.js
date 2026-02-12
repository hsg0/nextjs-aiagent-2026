// /backend/routes/googleGeminiAi/googleGeminiAiRoutes.js
import express from "express";
import webUserAuthCheck from "../../middleware/webUserAuthCheck.js";
import {
    askSkullFIreQuestionsController,
    conversationStart,
    conversationEnd,
} from "../../controllers/aicontroller/ai.js";

const googleGeminiAiRouter = express.Router();

googleGeminiAiRouter.post("/ask", webUserAuthCheck, askSkullFIreQuestionsController);
googleGeminiAiRouter.post("/conversation/start", webUserAuthCheck, conversationStart);
googleGeminiAiRouter.post("/conversation/end", webUserAuthCheck, conversationEnd);

export default googleGeminiAiRouter;
