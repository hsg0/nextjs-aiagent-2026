// /Volumes/sunny-2025/nextjs-aiagent-2026/src/app/(public)/resetpassword/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4040";

export default function ResetPassword() {
  const router = useRouter();

  const [screen, setScreen] = useState("email");
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [note, setNote] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const go = (path) => {
    console.log("[resetpassword] navigating to:", path);
    router.push(path);
  };

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setInterval(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendOtpToEmail(e) {
    e.preventDefault();
    setIsSending(true);
    setNote("");
    setError("");
    setSuccess("");

    console.log("[resetpassword] sending otp to:", email);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/send-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      console.log("[resetpassword] send-reset-otp response:", data);

      if (data?.success) {
        setSuccess(data?.message || "OTP sent to your email.");
        setScreen("otp");
        setCooldown(60);
        setNote("OTP sent to your email (valid for 10 minutes).");
      } else {
        setError(data?.message || "Could not send OTP.");
      }
    } catch (err) {
      console.log("[resetpassword] send otp error:", err);
      setError("Could not send OTP. Check your connection.");
    } finally {
      setIsSending(false);
    }
  }

  async function resendOtp() {
    if (isSending || cooldown > 0) return;

    setIsSending(true);
    setNote("");
    setError("");

    console.log("[resetpassword] resending otp to:", email);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/send-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      console.log("[resetpassword] resend otp response:", data);

      if (data?.success) {
        setCooldown(60);
        setNote("OTP sent to your email (valid for 10 minutes).");
      } else {
        setNote(data?.message || "Could not resend OTP.");
      }
    } catch (err) {
      console.log("[resetpassword] resend otp error:", err);
      setNote("Could not resend OTP.");
    } finally {
      setIsSending(false);
    }
  }

  function continueWithOtp(e) {
    e.preventDefault();
    setError("");

    console.log("[resetpassword] continueWithOtp otp length:", otp?.length);

    if (otp.trim().length !== 6) {
      setNote("Please enter the 6-digit OTP.");
      return;
    }
    setNote("");
    setScreen("newpass");
  }

  async function saveNewPassword(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    console.log("[resetpassword] saving new password for:", email);

    if (newPassword.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json();

      console.log("[resetpassword] reset-password response:", data);

      if (data?.success) {
        setSuccess(data?.message || "Password reset successfully!");
        setTimeout(() => router.replace("/login"), 600);
      } else {
        setError(data?.message || "Could not reset password.");
      }
    } catch (err) {
      console.log("[resetpassword] reset password error:", err);
      setError("Could not reset password. Check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  const onlyDigits = (v) => v.replace(/\D/g, "");
  const handleOtpChange = (v) => setOtp(onlyDigits(v).slice(0, 6));

  return (
    <main className="min-h-screen w-full overflow-hidden bg-black text-white">
      {/* Background gradients (majubee theme) */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
        <div className="absolute top-24 left-[-120px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-140px] h-[620px] w-[620px] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/65 to-black" />
      </div>

      {/* Back button */}
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-6">
        <button
          type="button"
          onClick={() => go("/")}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
        >
          ← Back to majubee
        </button>
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-6xl items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl sm:p-6">
            {/* Alerts */}
            {error ? (
              <p className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            {success ? (
              <p className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                {success}
              </p>
            ) : null}

            {/* Screen: EMAIL */}
            {screen === "email" && (
              <>
                <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                  🔑 Password reset
                </p>

                <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-white">
                  Reset your password
                </h1>

                <p className="mb-5 text-sm text-white/70">
                  Enter your registered email. We’ll send a one-time code to verify it’s you.
                </p>

                <form onSubmit={sendOtpToEmail} className="grid gap-3">
                  <label htmlFor="email" className="text-sm font-bold text-white/80">
                    Email address
                  </label>

                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/20"
                    value={email}
                    onChange={(e) => {
                      console.log("[resetpassword] email changed:", e.target.value);
                      setEmail(e.target.value);
                    }}
                    required
                  />

                  <button
                    type="button"
                    onClick={() => go("/login")}
                    className="justify-self-start rounded-xl px-2 py-1 text-xs font-bold text-white/70 hover:bg-white/10"
                  >
                    Remembered your password? Log in
                  </button>

                  <button
                    type="submit"
                    disabled={isSending || !email.trim()}
                    className="min-h-[52px] w-full rounded-2xl bg-white px-4 py-4 text-sm font-extrabold text-black shadow-lg transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
                  >
                    {isSending ? "Sending…" : "Send OTP"}
                  </button>
                </form>
              </>
            )}

            {/* Screen: OTP */}
            {screen === "otp" && (
              <>
                <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                  ✅ Verify
                </p>

                <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-white">
                  Verify your email
                </h1>

                <p className="mb-5 text-sm text-white/70">
                  We sent a one-time code to{" "}
                  <span className="font-bold text-white">{email}</span>. Enter it below to continue.
                </p>

                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={isSending || cooldown > 0}
                  className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-extrabold text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSending ? "Sending OTP…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
                </button>

                <form onSubmit={continueWithOtp} className="mt-4 grid gap-3">
                  <label htmlFor="otp" className="text-sm font-bold text-white/80">
                    Enter 6-digit OTP
                  </label>

                  <input
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-center text-sm tracking-[0.5em] text-white outline-none placeholder:text-white/30 focus:border-white/20"
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => handleOtpChange(e.target.value)}
                  />

                  <button
                    type="submit"
                    disabled={otp.length !== 6}
                    className="min-h-[52px] w-full rounded-2xl bg-white px-4 py-4 text-sm font-extrabold text-black shadow-lg transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
                  >
                    Verify Code
                  </button>
                </form>

                {note ? <p className="mt-4 text-sm text-white/80">{note}</p> : null}

                <p className="mt-6 text-xs text-white/50">
                  Didn’t get the code? Check spam or resend after the cooldown.
                </p>
              </>
            )}

            {/* Screen: NEW PASS */}
            {screen === "newpass" && (
              <>
                <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                  🔒 New password
                </p>

                <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-white">
                  Create a new password
                </h1>

                <p className="mb-5 text-sm text-white/70">
                  Choose a strong password you haven’t used here before.
                </p>

                <form onSubmit={saveNewPassword} className="grid gap-3">
                  <label htmlFor="new-pass" className="text-sm font-bold text-white/80">
                    New password
                  </label>

                  <input
                    id="new-pass"
                    type="password"
                    minLength={6}
                    placeholder="At least 6 characters"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/20"
                    value={newPassword}
                    onChange={(e) => {
                      console.log("[resetpassword] newPassword changed length:", e.target.value.length);
                      setNewPassword(e.target.value);
                    }}
                    required
                  />

                  <button
                    type="submit"
                    disabled={isSaving || newPassword.length < 6}
                    className="min-h-[52px] w-full rounded-2xl bg-white px-4 py-4 text-sm font-extrabold text-black shadow-lg transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
                  >
                    {isSaving ? "Saving…" : "Save Password"}
                  </button>

                  <button
                    type="button"
                    onClick={() => go("/login")}
                    className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
                  >
                    Back to login
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-white/50">
            By continuing, you agree to our terms & privacy policy.
          </p>
        </div>
      </div>
    </main>
  );
}