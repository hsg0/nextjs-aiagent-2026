"use client";

import React from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";

export default function VideoCallRoomPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const roomId = params?.videocallroom ?? "";
  const name = searchParams?.get("name") ?? "";
  const email = searchParams?.get("email") ?? "";

  const go = (path) => {
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
          onClick={() => go("/dashboard/videoscreenshare")}
          className="mb-6 inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
        >
          ← Back to lobby
        </button>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
            📹 In room
          </p>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Room: {roomId || "(no room)"}
          </h1>

          <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-sm font-semibold text-white/90">
              Name (from URL): <span className="text-white">{name || "—"}</span>
            </p>
            <p className="text-sm font-semibold text-white/90">
              Email (from URL): <span className="text-white">{email || "—"}</span>
            </p>
          </div>

          <p className="mt-4 text-xs text-white/50">
            These values were passed via search params from the lobby (?name=…&email=…).
          </p>
        </div>
      </div>
    </main>
  );
}
