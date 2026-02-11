// /Volumes/sunny-2025/nextjs-aiagent-2026/src/app/page.js
"use client";

import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  return (
    <main className="min-h-screen w-full overflow-hidden bg-black text-white">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
        <div className="absolute top-24 left-[-120px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-140px] h-[620px] w-[620px] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black" />
      </div>

      {/* Content */}
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-10">
        {/* Top text */}
        <div className="mb-6 text-center">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
            🧠 Virtual Assistant Platform
          </p>

          <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            Welcome to <span className="text-white/90">majubee</span>
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-white/70 sm:text-base">
            Sign in to continue, or create an account to get started.
          </p>
        </div>

        {/* Video card */}
        <div className="w-full max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
            {/* Subtle gradient overlay for blending */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/40" />

            <video
              className="h-auto w-full object-cover"
              src="/talkinghead1.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />

            {/* Bottom fade to help buttons visually separate */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          </div>

          {/* Buttons */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => router.push("/createaccount")}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-4 text-sm font-extrabold text-black shadow-lg transition active:scale-[0.99]"
            >
              Create Account
            </button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-sm font-extrabold text-white shadow-lg backdrop-blur-md transition hover:bg-white/10 active:scale-[0.99]"
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => router.push("/resetpassword")}
              className="col-span-full inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
            >
              Reset Password
            </button>
          </div>

          {/* Tiny footer note */}
          <p className="mt-5 text-center text-xs text-white/50">
            By continuing, you agree to our terms & privacy policy.
          </p>
        </div>
      </div>
    </main>
  );
}