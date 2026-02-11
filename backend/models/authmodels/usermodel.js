// user model
import mongoose from "mongoose";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 10);

const webUserSchema = new mongoose.Schema({
    userNanoId: {
        type: String,
        default: () => nanoid(),
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    verifyOtp: {
        type: String,
        default: '',
    },
    verifyOtpExpireAt: {
        type: Number,
        default: 0,
    },
    isAccountVerified: {
        type: Boolean,
        default: false
    },
    resetOtp: {
        type: String,
        default: '',
    },
    resetOtpExpireAt: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

const webUserModel = mongoose.model("WebUser", webUserSchema, "webusermodel");
export default webUserModel;