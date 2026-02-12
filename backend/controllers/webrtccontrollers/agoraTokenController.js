import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;
import dotenv from "dotenv";

dotenv.config();

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERT = process.env.AGORA_APP_CERT;

/**
 * GET /api/v1/agora/token?channel=ROOM_NAME&uid=12345
 *
 * Generates a temporary Agora RTC token for the given channel + uid.
 * Token valid for 1 hour.
 */
export const getAgoraToken = (req, res) => {
  try {
    const { channel, uid } = req.query;

    if (!channel) {
      return res.status(400).json({ error: "channel query param is required" });
    }

    if (!APP_ID || !APP_CERT) {
      console.log("[agora] missing AGORA_APP_ID or AGORA_APP_CERT in env");
      return res.status(500).json({ error: "Agora credentials not configured" });
    }

    const numericUid = parseInt(uid, 10) || 0;
    const role = RtcRole.PUBLISHER;
    const tokenExpirationInSeconds = 3600; // 1 hour
    const privilegeExpirationInSeconds = 3600;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERT,
      channel,
      numericUid,
      role,
      tokenExpirationInSeconds,
      privilegeExpirationInSeconds,
    );

    console.log("[agora] token generated for channel:", channel, "uid:", numericUid);

    return res.json({
      token,
      uid: numericUid,
      channel,
      appId: APP_ID,
    });
  } catch (error) {
    console.log("[agora] token generation error:", error?.message);
    return res.status(500).json({ error: "Failed to generate token" });
  }
};
