import jwt from "jsonwebtoken";
import webUserModel from "../models/authmodels/usermodel.js";
import dotenv from "dotenv";

dotenv.config();

const webUserAuth = async (req, res, next) => {
  // 1) Try to read the JWT from the cookie named "token".
  //    This is where the web login stored it.
  let token = req.cookies?.token;

  // 2) Optional fallback: if no cookie, check Authorization header.
  //    This lets you test with tools that send "Bearer <token>".
  if (!token) {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      token = auth.slice("Bearer ".length); // take the part after "Bearer "
    }
  }

  // 3) If we still don't have a token, the user isn't logged in.
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access: Please log in.",
    });
  }

  try {
    // 4) Verify the token with our JWT secret.
    //    The token was signed with { webUserId: user._id }
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 5) Pull the webUserId out of the token payload.
    const userId = payload?.webUserId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access: Invalid token.",
      });
    }

    // 6) Look up the user in the database.
    //    We only select minimal fields we need.
    const user = await webUserModel.findById(userId).select("_id name email");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access: User not found.",
      });
    }

    // 7) Attach a small user object to req so downstream handlers know who this is.
    req.user = {
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
    };

    // 8) All good — pass control to the next handler.
    return next();
  } catch (error) {
    // 9) Any verify/DB error means the token is bad or expired.
    console.error("Authentication error:", error.message);
    return res.status(401).json({
      success: false,
      message: "Unauthorized access: Invalid or expired token.",
    });
  }
};

export default webUserAuth;
