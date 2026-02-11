// auth router
import express from "express";
import webUserAuthCheck from "../../middleware/webUserAuthCheck.js";
import {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  sendVerifyOtp,
  verifyEmail,
  resendVerificationEmail,
  verifyEmailToken,
  resendVerificationEmailToken,
  isAuthenticated,
  sendResetOtp,
  getUserData,
} from "../../controllers/authcontroller/auth.js";

const authRouter = express.Router();

// Public
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/send-reset-otp", sendResetOtp);
authRouter.post("/resend-verification-email", resendVerificationEmail);
authRouter.post("/resend-verification-email-token", resendVerificationEmailToken);
authRouter.post("/verify-email-token/:token", verifyEmailToken);

// Protected (require auth)
authRouter.post("/send-verify-otp", webUserAuthCheck, sendVerifyOtp);
authRouter.post("/verify-email", webUserAuthCheck, verifyEmail);
authRouter.get("/me", webUserAuthCheck, isAuthenticated);
authRouter.get("/user", webUserAuthCheck, getUserData);

export default authRouter;