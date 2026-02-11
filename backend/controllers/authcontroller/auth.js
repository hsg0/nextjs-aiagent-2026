// Auth controller for auth routes

import webUserModel from "../../models/authmodels/usermodel.js";
import webTransporter from "../../config/brevo.js";
import { getLocationFromIp } from "../../utils/getLocationFromIp.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import webUserAuthCheck from "../../middleware/webUserAuthCheck.js";
import dotenv from "dotenv";

dotenv.config();

const SENDER_EMAIL = "majubee84@gmail.com";

const { verify , sign } = jwt;

export const register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "Please fill all the fields" });
    }
    try { 
        const doesEmailAlreadyExist = await webUserModel.findOne({ email });
        if (doesEmailAlreadyExist) {
            return res.status(400).json({ message: "User with this email already exists" });
        }
        const hashIncomingPassword = await bcrypt.hash(password, 10);

        const createNewUser = new webUserModel({
            name: name,
            email: email,
            password: hashIncomingPassword,
        });
        await createNewUser.save();

        const token = jwt.sign({
            webUserId: createNewUser._id,
        }, process.env.JWT_SECRET, { expiresIn: "1d" });

        res.cookie(
            "token",
            token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                maxAge: 24 * 60 * 60 * 1000, // 1 day
            }
        )
        const sendWelcomeEmail = {
            from: SENDER_EMAIL,
            to: email,
            subject: "Welcome to Majubee",
            text: `Welcome to Majubee ${name}`,
            html: `<p>Welcome to Majubee ${name}. Now you can login to your account and Explore the world of Majubee</p>`,
        }
        await webTransporter.sendMail(sendWelcomeEmail);

        res.status(201).json({
            success: true,
            message: "User was created successfully",
            token: token,
            webUserId: createNewUser._id,
            name: createNewUser.name,
            email: createNewUser.email,
            createdAt: createNewUser.createdAt,
            updatedAt: createNewUser.updatedAt,
        })

    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
}


//----------------------------------------------------------
//----------------------------------------------------------
// Login Controller
//----------------------------------------------------------
//----------------------------------------------------------


export const login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Please fill all the fields" });
    }
    try {
        const userEmail = await webUserModel.findOne({ email });
        if (!userEmail) {
            return res.status(400).json({ 
                success: false,
                message: "This email address is not registered with us. Please register first."
            });
        }
        const isPasswordCorrect = await bcrypt.compare(
            password,
            userEmail.password
        );
        if (!isPasswordCorrect) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid password"
            });
        }

        const token = jwt.sign({
            webUserId: userEmail._id,
        }, process.env.JWT_SECRET, { expiresIn: "1d" });

        res.cookie(
            "token",
            token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                maxAge: 24 * 60 * 60 * 1000, // 1 day
            }
        );

        try {
            const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.connection?.remoteAddress || "";
            const location = await getLocationFromIp(clientIp);
            const loginTime = new Date().toLocaleString();
            await webTransporter.sendMail({
                from: SENDER_EMAIL,
                to: userEmail.email,
                subject: "New login to your Majubee account",
                text: `A login to your Majubee account was detected.\n\nLocation: ${location}\nTime: ${loginTime}\n\nIf this wasn't you, please secure your account.`,
                html: `<p>A login to your Majubee account was detected.</p><p><strong>Location:</strong> ${location}</p><p><strong>Time:</strong> ${loginTime}</p><p>If this wasn't you, please secure your account.</p>`,
            });
        } catch (err) {
            console.error("Login location email failed:", err.message);
        }

        res.status(200).json({
            success: true,
            message: "Login successful",
            token: token,
            webUserId: userEmail._id,
            name: userEmail.name,
            email: userEmail.email,
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
};


//----------------------------------------------------------
//----------------------------------------------------------
// Logout Controller
//----------------------------------------------------------
//----------------------------------------------------------

export const logout = async (req, res) => {
    try {
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 0,
        });
        return res.status(200).json({
            success: true,
            message: "Logout successful",
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
}


//----------------------------------------------------------
//----------------------------------------------------------
// Reset Password Controller
//----------------------------------------------------------
//----------------------------------------------------------



export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "Please fill all the fields" });
    }
    try {
        const userEmail = await webUserModel.findOne({ email });
        if (!userEmail) {
            return res.status(400).json({ 
                success: false,
                message: "This email address is not registered with us. Please register first."
            });
        }
        const resetPasswordToken = jwt.sign({
            email: userEmail.email,
        }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const resetPasswordUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetPasswordToken}`;
        const resetPasswordEmail = {
            from: SENDER_EMAIL,
            to: userEmail.email,
            subject: "Reset your Majubee password",
            text: `Click the link below to reset your Majubee password: ${resetPasswordUrl}`,
            html: `<p>Click the link below to reset your Majubee password: <a href="${resetPasswordUrl}">${resetPasswordUrl}</a></p>`,
        }
        await webTransporter.sendMail(resetPasswordEmail);
        return res.status(200).json({
            success: true,
            message: "Reset password email sent successfully",
            resetPasswordUrl: resetPasswordUrl,
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
}


//----------------------------------------------------------
//----------------------------------------------------------
// Reset Password Controller
//----------------------------------------------------------
//----------------------------------------------------------




//----------------------------------------------------------
//----------------------------------------------------------
// Send verification OTP (protected)
//----------------------------------------------------------
//----------------------------------------------------------

export const sendVerifyOtp = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(400).json({ success: false, message: "User ID is required" });
    }
    try {
        const user = await webUserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (user.isAccountVerified === true) {
            return res.status(400).json({ success: false, message: "Account already verified" });
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.verifyOtp = otp;
        user.verifyOtpExpireAt = Date.now() + 10 * 60 * 1000;
        await user.save();

        await webTransporter.sendMail({
            from: SENDER_EMAIL,
            to: user.email,
            subject: "Majubee - Your Verification OTP",
            html: `
                <p>Hello ${user.name},</p>
                <p>Your OTP for email verification is: <b>${otp}</b></p>
                <p>This OTP is valid for 10 minutes.</p>
                <p>If you did not request this, please ignore this email.</p>
                <br/>
                <p>Best regards,<br/>The Majubee Team</p>
            `,
        });
        return res.status(200).json({ success: true, message: "OTP sent to your email address" });
    } catch (error) {
        console.error("Error sending OTP:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

//----------------------------------------------------------
// Verify email with OTP (protected)
//----------------------------------------------------------

export const verifyEmail = async (req, res) => {
    const userId = req.user?.userId;
    const { otp } = req.body;
    if (!userId || !otp) {
        return res.status(400).json({ success: false, message: "User ID and OTP are required" });
    }
    try {
        const user = await webUserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (user.isAccountVerified === true) {
            return res.status(400).json({ success: false, message: "Account already verified" });
        }
        if (user.verifyOtp === "" || user.verifyOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
        if (Date.now() > user.verifyOtpExpireAt) {
            return res.status(400).json({ success: false, message: "OTP has expired" });
        }
        user.isAccountVerified = true;
        user.verifyOtp = "";
        user.verifyOtpExpireAt = 0;
        await user.save();
        return res.status(200).json({
            success: true,
            message: "Email verified successfully",
            user: { userId: user._id, name: user.name, email: user.email },
        });
    } catch (error) {
        console.error("Error verifying email:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

//----------------------------------------------------------
// Resend Verification Email (link)
//----------------------------------------------------------

export const resendVerificationEmail = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "Please fill all the fields" });
    }
    try {
        const userEmail = await webUserModel.findOne({ email });
        if (!userEmail) {
            return res.status(400).json({ 
                success: false,
                message: "This email address is not registered with us. Please register first."
            });
        }
        const verifyEmailToken = jwt.sign({
            email: userEmail.email,
        }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const verifyEmailUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verifyEmailToken}`;
        const verifyEmailEmail = {
            from: SENDER_EMAIL,
            to: userEmail.email,    
            subject: "Verify your Majubee email",
            text: `Click the link below to verify your Majubee email: ${verifyEmailUrl}`,
            html: `<p>Click the link below to verify your Majubee email: <a href="${verifyEmailUrl}">${verifyEmailUrl}</a></p>`,
        }
        await webTransporter.sendMail(verifyEmailEmail);
        return res.status(200).json({
            success: true,
            message: "Verification email sent successfully",
            verifyEmailUrl: verifyEmailUrl,
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const resendVerificationEmailToken = resendVerificationEmail;

//----------------------------------------------------------
// Verify Email Token (from link)
//----------------------------------------------------------

export const verifyEmailToken = async (req, res) => {
    const { token } = req.params;
    if (!token) {
        return res.status(400).json({ success: false, message: "Token is required" });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const email = decoded.email;
        const user = await webUserModel.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        user.isAccountVerified = true;
        user.verifyOtp = "";
        user.verifyOtpExpireAt = 0;
        await user.save();
        return res.status(200).json({
            success: true,
            message: "Email verified successfully",
            user: { userId: user._id, name: user.name, email: user.email },
        });
    } catch (error) {
        console.error("Error verifying email token:", error);
        return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }
};

//----------------------------------------------------------
// Is authenticated (protected)
//----------------------------------------------------------

export const isAuthenticated = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ success: false, message: "User ID is required" });
    }
    try {
        const user = await webUserModel
            .findById(userId)
            .select("-password -verifyOtp -verifyOtpExpireAt -resetOtp -resetOtpExpireAt");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        return res.status(200).json({
            success: true,
            message: "User is authenticated",
            user: {
                userId: user._id,
                name: user.name,
                email: user.email,
                isAccountVerified: user.isAccountVerified,
            },
        });
    } catch (error) {
        console.error("Error checking authentication:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

//----------------------------------------------------------
// Send reset OTP (public)
//----------------------------------------------------------

export const sendResetOtp = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
    }
    try {
        const user = await webUserModel.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetOtp = otp;
        user.resetOtpExpireAt = Date.now() + 10 * 60 * 1000;
        await user.save();

        await webTransporter.sendMail({
            from: SENDER_EMAIL,
            to: user.email,
            subject: "Majubee - Your Password Reset OTP",
            html: `
                <p>Hello ${user.name},</p>
                <p>Your OTP for password reset is: <b>${otp}</b></p>
                <p>This OTP is valid for 10 minutes.</p>
                <p>If you did not request this, please ignore this email.</p>
                <br/>
                <p>Best regards,<br/>The Majubee Team</p>
            `,
        });
        return res.status(200).json({ success: true, message: "OTP sent to your email address" });
    } catch (error) {
        console.error("Error sending reset OTP:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

//----------------------------------------------------------
// Reset password with OTP (public)
//----------------------------------------------------------

export const resetPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
        return res.status(400).json({ success: false, message: "Email, OTP, and new password are required" });
    }
    try {
        const user = await webUserModel.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (user.resetOtp === "" || user.resetOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
        if (Date.now() > user.resetOtpExpireAt) {
            return res.status(400).json({ success: false, message: "OTP has expired" });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        user.resetOtp = "";
        user.resetOtpExpireAt = 0;
        await user.save();
        return res.status(200).json({ success: true, message: "Password reset successfully" });
    } catch (error) {
        console.error("Error resetting password:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

//----------------------------------------------------------
// Get user data (protected)
//----------------------------------------------------------

export const getUserData = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "User ID is required" });
        }
        const user = await webUserModel.findById(userId).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        return res.status(200).json({
            success: true,
            message: "User data retrieved successfully",
            userData: {
                userId: user._id,
                name: user.name,
                email: user.email,
                isAccountVerified: user.isAccountVerified,
            },
        });
    } catch (error) {
        console.error("Error in getUserData:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};