import express from "express";
import { listMessages } from "../../controllers/webrtccontrollers/messageController.js";

const router = express.Router();

// GET /webrtc/messages/:roomKey?limit=50
router.get("/:roomKey", listMessages);

export default router;