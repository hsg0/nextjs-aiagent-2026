// /Volumes/sunny-2025/nextjs-aiagent-2026/src/app/(private)/dashboard/page.jsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../../context/UserContext";
import { usePrivateRoute } from "../layout";

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useUser();
  const { params, searchParams } = usePrivateRoute();

  const go = (path) => {
    console.log("[dashboard] navigating to:", path);
    router.push(path);
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

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10">
        {/* Header: user from layout (getUserData) + route context */}
        <div className="mb-6">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
            🧠 majubee dashboard
          </p>

          <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            What do you want to do{user?.name ? `, ${user.name}` : ""}?
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-white/70 sm:text-base">
            Choose one option below. You can talk to your virtual assistant, or meet someone in a room and screen share.
          </p>
          {user?.email && (
            <p className="mt-1 text-xs text-white/50">Signed in as {user.email}</p>
          )}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Virtual assistant */}
          <button
            type="button"
            onClick={() => go("/dashboard/vrassistant")}
            className="group w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-left shadow-2xl backdrop-blur-xl transition hover:bg-white/10 active:scale-[0.995] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                  🎙️ Option 1
                </div>
                <h2 className="mt-3 text-xl font-extrabold text-white/90 sm:text-2xl">
                  Talk to Virtual Assistant
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  Ask questions, get answers, and build your agent experience.
                </p>
              </div>

              <div className="shrink-0 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-bold text-white/70 group-hover:text-white">
                Open →
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                Voice + text
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                Closed captions
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                Agent tools
              </span>
            </div>
          </button>

          {/* Video room + screen share */}
          <button
            type="button"
            onClick={() => go("/dashboard/videoscreenshare")}
            className="group w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-left shadow-2xl backdrop-blur-xl transition hover:bg-white/10 active:scale-[0.995] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                  🧑‍🤝‍🧑 Option 2
                </div>
                <h2 className="mt-3 text-xl font-extrabold text-white/90 sm:text-2xl">
                  Meet in a Room + Screen Share
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  Join or create a room, talk, and share your screen to collaborate.
                </p>
              </div>

              <div className="shrink-0 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-bold text-white/70 group-hover:text-white">
                Open →
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                Rooms
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                Video + audio
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                Screen share
              </span>
            </div>
          </button>
        </div>

        {/* Footer quick actions */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {/* <button
            type="button"
            onClick={() => go("/")}
            className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99] sm:w-auto"
          >
            Back home
          </button> */}
        </div>
      </div>
    </main>
  );
}