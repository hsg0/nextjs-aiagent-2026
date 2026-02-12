"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "../../../../context/UserContext";

export default function VideoScreenSharePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-black text-white">Loading...</div>}>
      <VideoScreenShareInner />
    </Suspense>
  );
}

function VideoScreenShareInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [displayNameOverride, setDisplayNameOverride] = useState("");
  const [roomNameOverride, setRoomNameOverride] = useState("");
  const [camStatus, setCamStatus] = useState("loading"); // loading | ready | denied | error
  const [camError, setCamError] = useState("");

  const email = user?.email || "";
  const displayName = (displayNameOverride || user?.name || "").trim();
  const urlRoom = searchParams?.get("room") ?? "";
  const roomName = (roomNameOverride || urlRoom).trim();

  const initials = useMemo(() => {
    const n = (displayName || email || "U").trim();
    const parts = n.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[1]?.[0] : "";
    return (a + b).toUpperCase();
  }, [displayName, email]);

  const go = (path) => {
    console.log("[videoscreenshare] navigating to:", path);
    router.push(path);
  };

  // Ask for camera + mic permissions as soon as user enters this page
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      console.log("[videoscreenshare] requesting camera+mic permissions...");
      setCamStatus("loading");
      setCamError("");

      if (typeof window === "undefined") return;

      const mediaDevices = navigator?.mediaDevices;
      if (!mediaDevices?.getUserMedia) {
        setCamStatus("error");
        setCamError("Camera/mic not supported in this browser.");
        return;
      }

      try {
        const stream = await mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        console.log("[videoscreenshare] ✅ camera stream ready");
        setCamStatus("ready");
      } catch (err) {
        console.log("[videoscreenshare] ❌ permission error:", err);
        const name = err?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setCamStatus("denied");
          setCamError("Permission denied. Please allow camera + mic and refresh.");
        } else {
          setCamStatus("error");
          setCamError("Could not access camera/mic. Check browser settings.");
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        console.log("[videoscreenshare] stopping camera tracks...");
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // When we switch to "ready", the <video> mounts; attach stream if we have it
  useEffect(() => {
    if (camStatus !== "ready" || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch((e) => console.log("[videoscreenshare] play:", e?.message));
  }, [camStatus]);

  const handleGoToRoom = (e) => {
    e?.preventDefault?.();

    const rn = roomName;
    const dn = displayName;
    const em = email;

    console.log("[videoscreenshare] go to room clicked:", { roomName: rn, name: dn, email: em });

    if (!rn) {
      setCamError("Please enter a room name or number.");
      return;
    }

    // ✅ Pass everything downstream through URL
    const qp = new URLSearchParams();
    if (dn) qp.set("name", dn);
    if (em) qp.set("email", em);

    const target = `/dashboard/videoscreenshare/${encodeURIComponent(rn)}?${qp.toString()}`;
    go(target);
  };

  return (
    <main className="min-h-screen w-full overflow-hidden bg-black text-white">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
        <div className="absolute top-24 left-[-120px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-140px] h-[620px] w-[620px] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/65 to-black" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10">
        <button
          type="button"
          onClick={() => go("/dashboard")}
          className="mb-6 inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
        >
          ← Back to dashboard
        </button>

        {/* Lobby card */}
        <div className="mx-auto w-full max-w-xl">
          <div className="relative rounded-3xl border border-white/10 bg-white/5 px-5 pb-6 pt-28 shadow-2xl backdrop-blur-xl sm:px-6 sm:pb-7 sm:pt-32">
            {/* Camera circle (top center) - large so it reads clearly vs the card */}
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
              <div className="h-40 w-40 overflow-hidden rounded-full border-2 border-white/20 bg-white/10 shadow-2xl sm:h-48 sm:w-48">
                {camStatus === "ready" ? (
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                    aria-label="Your camera preview"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-linear-to-b from-white/10 to-white/5">
                    <span className="text-3xl font-extrabold text-white/90 sm:text-4xl">{initials}</span>
                  </div>
                )}
              </div>

              {/* status dot - scaled with circle */}
              <div className="absolute -bottom-0.5 -right-0.5 h-8 w-8 rounded-full border-2 border-white/20 bg-black/70 p-1.5 shadow-lg sm:h-9 sm:w-9">
                <div
                  className={`h-full w-full rounded-full ${
                    camStatus === "ready"
                      ? "bg-green-400/80"
                      : camStatus === "loading"
                      ? "bg-yellow-400/70"
                      : "bg-red-400/80"
                  }`}
                  title={
                    camStatus === "ready"
                      ? "Camera ready"
                      : camStatus === "loading"
                      ? "Requesting permissions"
                      : "Camera not ready"
                  }
                />
              </div>
            </div>

            {/* Header */}
            <div className="text-center">
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                🧑‍🤝‍🧑 Create or Join a Room
              </p>

              <h1 className="text-balance text-2xl font-extrabold tracking-tight sm:text-3xl">
                Video + Screen Share Lobby
              </h1>

              <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
                Your camera and microphone permissions will be requested as soon as you enter this page.
              </p>
            </div>

            {/* Errors / notes */}
            {(camError || camStatus === "denied") && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <p className="text-sm font-semibold text-white/90">Notice</p>
                <p className="mt-1 text-sm text-white/70">
                  {camError ||
                    "Permission denied. Please allow camera + mic in your browser settings and refresh."}
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleGoToRoom} className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-bold text-white/80">Your Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayNameOverride(e.target.value)}
                  placeholder="Your display name"
                  className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition focus:border-white/30 focus:ring-1 focus:ring-white/20"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-bold text-white/80">Email</label>
                <input
                  value={email}
                  readOnly
                  disabled
                  className="w-full cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 placeholder-white/40 outline-none"
                  placeholder="you@example.com"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-bold text-white/80">Room Name / Number</label>
                <input
                  value={roomName}
                  onChange={(e) => setRoomNameOverride(e.target.value)}
                  placeholder="Enter room name..."
                  className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition focus:border-white/30 focus:ring-1 focus:ring-white/20"
                />
                <p className="text-xs text-white/50">
                  Tip: Share this room name with a friend so you both join the same room.
                </p>
              </div>

              <button
                type="submit"
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-sm font-extrabold text-black shadow-lg transition hover:bg-white/90 active:scale-[0.99]"
              >
                Go to Room <span aria-hidden="true">→</span>
              </button>

              <p className="text-center text-[11px] text-white/50">
                Passing downstream via URL: <span className="text-white/70">room param + ?name=&amp;email=</span>
              </p>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}