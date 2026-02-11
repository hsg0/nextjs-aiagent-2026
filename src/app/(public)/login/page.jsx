// /Volumes/sunny-2025/nextjs-aiagent-2026/src/app/(public)/login/page.jsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4040";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().includes("@") && password.length >= 6;
  }, [email, password]);

  const go = (path) => {
    console.log("[login] navigating to:", path);
    router.push(path);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!canSubmit) {
      setError("Please enter a valid email and password (6+ chars).");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data } = await axios.post(
        `${API_BASE}/api/v1/auth/login`,
        { email: email.trim(), password },
        { withCredentials: true }
      );

      if (data?.success) {
        setSuccess(data?.message || "Login successful!");
        setTimeout(() => router.replace("/dashboard"), 600);
      } else {
        setError(data?.message || "Login failed.");
      }
    } catch (err) {
      console.error("[login] error:", err);
      setError(err?.response?.data?.message || "Could not connect to the server. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full overflow-hidden bg-black text-white">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
        <div className="absolute top-24 left-[-120px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-140px] h-[620px] w-[620px] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/65 to-black" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-6 text-center">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
              🔐 Sign in
            </p>

            <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              Welcome back to <span className="text-white/90">majubee</span>
            </h1>

            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-white/70 sm:text-base">
              Enter your email and password to continue.
            </p>
          </div>

          {/* Card */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl sm:p-6">
            {error && (
              <p className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            )}
            {success && (
              <p className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                {success}
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="mb-2 block text-sm font-bold text-white/80">Email</label>
                <input
                  value={email}
                  onChange={(e) => {
                    console.log("[login] email changed:", e.target.value);
                    setEmail(e.target.value);
                  }}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/20"
                />
              </div>

              {/* Password */}
              <div>
                <label className="mb-2 block text-sm font-bold text-white/80">Password</label>

                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => {
                      console.log("[login] password changed length:", e.target.value.length);
                      setPassword(e.target.value);
                    }}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 pr-14 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/20"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      console.log("[login] toggle password visibility:", !showPassword);
                      setShowPassword((v) => !v);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 active:scale-[0.99]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => go("/resetpassword")}
                    className="rounded-xl px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                  >
                    Forgot password?
                  </button>

                  <button
                    type="button"
                    onClick={() => go("/createaccount")}
                    className="rounded-xl px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                  >
                    Create account
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit || isSubmitting}
                className={`min-h-[52px] w-full rounded-2xl px-4 py-4 text-sm font-extrabold shadow-lg transition active:scale-[0.99] ${
                  canSubmit && !isSubmitting ? "bg-white text-black" : "cursor-not-allowed bg-white/20 text-white/50"
                }`}
              >
                {isSubmitting ? "Signing in…" : "Sign In"}
              </button>

              {/* Back home */}
              <button
                type="button"
                onClick={() => go("/")}
                className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
              >
                Back home
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-xs text-white/50">
            By continuing, you agree to our terms & privacy policy.
          </p>
        </div>
      </div>
    </main>
  );
}