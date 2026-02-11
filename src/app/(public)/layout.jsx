// /Volumes/sunny-2025/nextjs-aiagent-2026/src/app/(public)/layout.jsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function PublicLayout({ children }) {
  const router = useRouter();

  const go = (path) => {
    console.log("[public-layout] navigating to:", path);
    router.push(path);
  };

  return (
    <div className="bg-black text-white min-h-screen w-full">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 px-4 py-3 shadow-lg backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          {/* Logo (left) */}
          <button
            type="button"
            onClick={() => go("/")}
            className="flex items-center gap-2 rounded-xl px-2 py-1 transition hover:bg-white/5 active:scale-[0.99]"
            aria-label="Go to home"
          >
            <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-white/10">
              <video
                src="/talkinghead2.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover"
              />
            </div>
            <span className="ml-2 text-lg font-extrabold text-white/90">majubee</span>
          </button>

          {/* Menu (right) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => go("/createaccount")}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99] sm:px-4 sm:text-sm"
            >
              Create Account
            </button>

            <button
              type="button"
              onClick={() => go("/login")}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99] sm:px-4 sm:text-sm"
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => go("/resetpassword")}
              className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99] sm:inline-flex sm:px-4 sm:text-sm"
            >
              Reset Password
            </button>
          </div>
        </div>

        {/* Mobile-only reset password button (full width) */}
        <div className="mx-auto mt-2 w-full max-w-6xl sm:hidden">
          <button
            type="button"
            onClick={() => go("/resetpassword")}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
          >
            Reset Password
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="w-full">{children}</main>
    </div>
  );
}