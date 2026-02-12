import express from "express";
import { getOrCreateRoom, getParticipants } from "../../controllers/webrtccontrollers/roomController.js";

const router = express.Router();

// GET /webrtc/rooms/:roomKey
router.get("/:roomKey", getOrCreateRoom);

// GET /webrtc/rooms/:roomKey/participants
router.get("/:roomKey/participants", getParticipants);

export default router;