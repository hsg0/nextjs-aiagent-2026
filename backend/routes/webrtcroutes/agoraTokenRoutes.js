import express from "express";
import webUserAuthCheck from "../../middleware/webUserAuthCheck.js";
import { getAgoraToken } from "../../controllers/webrtccontrollers/agoraTokenController.js";

const router = express.Router();

// GET /api/v1/agora/token?channel=ROOM_NAME&uid=12345
router.get("/token", webUserAuthCheck, getAgoraToken);

export default router;
