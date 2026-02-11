"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../../../context/UserContext";
import { usePrivateRoute } from "../../layout";

export default function VrAssistantPage() {
  const router = useRouter();
  const { user } = useUser();
  const { params, searchParams } = usePrivateRoute();

  const go = (path) => {
    console.log("[vrassistant] navigating to:", path);
    router.push(path);
  };

  return (
    <main className="min-h-screen w-full overflow-hidden bg-black text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
        <div className="absolute top-24 left-[-120px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-140px] h-[620px] w-[620px] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/65 to-black" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10">
        <button
          type="button"
          onClick={() => go("/dashboard")}
          className="mb-6 inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
        >
          ← Back to dashboard
        </button>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
            🎙️ Virtual Assistant
          </p>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Virtual Assistant{user?.name ? ` for ${user.name}` : ""}
          </h1>

          <p className="mt-2 text-sm text-white/70 sm:text-base">
            This is a placeholder page. Next we’ll build the talking-head UI, voice input/output, and connect it to your backend.
          </p>

          {user?.email && (
            <p className="mt-1 text-xs text-white/50">Signed in as {user.email}</p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => console.log("[vrassistant] start chat clicked")}
              className="min-h-[52px] w-full rounded-2xl bg-white px-4 py-4 text-sm font-extrabold text-black shadow-lg transition hover:bg-white/90 active:scale-[0.99] sm:w-auto"
            >
              Start Assistant (soon)
            </button>

            <button
              type="button"
              onClick={() => console.log("[vrassistant] settings clicked")}
              className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99] sm:w-auto"
            >
              Settings (soon)
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
