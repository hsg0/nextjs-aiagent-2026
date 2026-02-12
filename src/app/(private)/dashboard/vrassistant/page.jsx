"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../../../context/UserContext";
import { io } from "socket.io-client";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4040";

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function VrAssistantPage() {
  const router = useRouter();
  const { user } = useUser();

  const videoRef = useRef(null);
  const nextCcIdRef = useRef(0);
  const makeCcId = () => `cc-${++nextCcIdRef.current}-${Date.now()}`;

  const socketRef = useRef(null);
  const recognitionRef = useRef(null);
  const conversationIdRef = useRef(null);
  const currentAssistantCcIdRef = useRef(null);
  const ttsBufferRef = useRef("");
  const isSpeakingRef = useRef(false);
  const ttsQueueRef = useRef([]);
  const currentUtteranceRef = useRef(null);   // prevent Chrome GC of active utterance
  const resumeIntervalRef = useRef(null);     // Chrome 15-second pause workaround
  const ttsTimeoutRef = useRef(null);         // safety timeout if onend never fires
  const processNextTTSRef = useRef(null);     // ref for self-referencing TTS queue processor
  const debounceTimerRef = useRef(null);
  const pendingTranscriptRef = useRef("");
  const rateLimitCooldownUntilRef = useRef(0);
  const preferredVoiceRef = useRef(null);

  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const retryTimerRef = useRef(null);
  const lastSentTextRef = useRef(null);
  const [ccLines, setCcLines] = useState(() => [
    { id: `cc-0-${Date.now()}`, who: "assistant", text: "Hi! Tap the circle to start talking.", ts: Date.now() },
  ]);

  const go = (path) => {
    router.push(path);
  };

  const addCC = useCallback((who, text) => {
    const id = makeCcId();
    setCcLines((prev) => {
      const next = [...prev, { id, who, text, ts: Date.now() }];
      return next.slice(-50);
    });
    return id;
  }, []);

  // Keep a stable default voice. We intentionally avoid custom voice
  // preference logic for now to keep behavior simple and predictable.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => v.default) || null;
      preferredVoiceRef.current = preferred;
    };

    pickVoice();
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
    };
  }, []);

  // TTS queue processor — implementation stored in a ref so it can self-reference
  // without triggering "accessed before declaration" or "ref during render" lint errors.
  useEffect(() => {
    processNextTTSRef.current = () => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      // Clear any previous safety timeout
      clearTimeout(ttsTimeoutRef.current);
      ttsTimeoutRef.current = null;

      if (ttsQueueRef.current.length === 0) {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
        // Stop the resume-interval — nothing left to speak
        clearInterval(resumeIntervalRef.current);
        resumeIntervalRef.current = null;
        // Queue empty — restart STT after a short delay to avoid echo
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch (_) {}
        }, 800);
        return;
      }

      const text = ttsQueueRef.current.shift();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      if (preferredVoiceRef.current) {
        u.voice = preferredVoiceRef.current;
        u.lang = preferredVoiceRef.current.lang || "en-US";
      } else {
        u.lang = "en-US";
      }

      const advance = () => {
        clearTimeout(ttsTimeoutRef.current);
        ttsTimeoutRef.current = null;
        processNextTTSRef.current?.();
      };

      u.onend = advance;
      u.onerror = advance;

      // Keep a strong reference so Chrome GC doesn't collect the utterance
      currentUtteranceRef.current = u;
      // Ensure synth is not paused (Chrome can get stuck after cancel)
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(u);

      // Safety timeout: if onend/onerror never fires, force-advance after 10 s
      ttsTimeoutRef.current = setTimeout(() => {
        ttsTimeoutRef.current = null;
        processNextTTSRef.current?.();
      }, 10000);
    };
  }, []);

  // Stable wrapper for other hooks to depend on
  const processNextTTS = useCallback(() => {
    processNextTTSRef.current?.();
  }, []);

  // Queue text for TTS — never calls cancel(); just adds to the queue
  const speakChunk = useCallback((text) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) return;
    ttsQueueRef.current.push(text.trim());
    if (!isSpeakingRef.current) {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      // Pause STT while speaking to avoid echo
      try {
        recognitionRef.current?.stop();
      } catch (_) {}
      // Chrome pauses speechSynthesis after ~15 s; keep it alive with resume()
      if (!resumeIntervalRef.current) {
        resumeIntervalRef.current = setInterval(() => {
          try { window.speechSynthesis.resume(); } catch (_) {}
        }, 5000);
      }
      processNextTTS();
    }
  }, [processNextTTS]);

  // Cancel all TTS immediately (used for barge-in and stop)
  const cancelAllTTS = useCallback(() => {
    ttsQueueRef.current = [];
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    currentUtteranceRef.current = null;
    clearInterval(resumeIntervalRef.current);
    resumeIntervalRef.current = null;
    clearTimeout(ttsTimeoutRef.current);
    ttsTimeoutRef.current = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const flushTTSBuffer = useCallback(() => {
    const buf = ttsBufferRef.current.trim();
    ttsBufferRef.current = "";
    if (buf) speakChunk(buf);
  }, [speakChunk]);

  const testVoice = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      addCC("system", "Speech synthesis is not available in this browser.");
      return;
    }
    const sample = "This is a voice test. If you can hear this, text to speech is working.";
    ttsBufferRef.current = "";
    cancelAllTTS();
    const u = new SpeechSynthesisUtterance(sample);
    u.rate = 0.95;
    u.pitch = 1;
    u.volume = 1;
    if (preferredVoiceRef.current) {
      u.voice = preferredVoiceRef.current;
      u.lang = preferredVoiceRef.current.lang || "en-US";
    } else {
      u.lang = "en-US";
    }
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(u);
      addCC("system", "Running voice test...");
    } catch (_) {
      addCC("system", "Voice test failed. Check browser audio permissions.");
    }
  }, [addCC, cancelAllTTS]);

  const startConversation = useCallback(async () => {
    if (isConnecting || isActive) return;
    setIsConnecting(true);
    // Warm-up: unlock Chrome speechSynthesis from a user-gesture context.
    // We must speak() once from the gesture and NOT cancel it, so Chrome
    // allows later speak() calls from async (socket) callbacks.
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.getVoices(); // trigger voice list load (Chrome loads async)
      const warmup = new SpeechSynthesisUtterance(" ");
      warmup.volume = 0;
      warmup.lang = "en-US";
      window.speechSynthesis.speak(warmup);
      // Do not cancel here — let warmup run to completion so TTS stays unlocked.
    }
    try {
      const { data } = await axios.post(
        `${API_BASE}/api/v1/google-gemini-ai/conversation/start`,
        {},
        { withCredentials: true }
      );
      if (data?.success && data?.conversationId) {
        conversationIdRef.current = data.conversationId;
        if (!socketRef.current?.connected) {
          const socket = io(API_BASE, {
            withCredentials: true,
            path: "/socket.io",
          });
          socketRef.current = socket;
          socket.on("ai_token", ({ token }) => {
            setCcLines((prev) => {
              const last = prev[prev.length - 1];
              if (last?.who === "assistant" && last?.id === currentAssistantCcIdRef.current) {
                return prev.slice(0, -1).concat([{ ...last, text: last.text + token }]);
              }
              const id = makeCcId();
              currentAssistantCcIdRef.current = id;
              return [...prev, { id, who: "assistant", text: token, ts: Date.now() }].slice(-50);
            });
            ttsBufferRef.current += token;
            const buf = ttsBufferRef.current;
            const sentenceEnd = /[.!?]\s*$/.test(buf);
            if (sentenceEnd || buf.length > 60) {
              ttsBufferRef.current = "";
              speakChunk(buf);
            }
          });
          socket.on("ai_done", () => {
            flushTTSBuffer();
            currentAssistantCcIdRef.current = null;
          });
          socket.on("ai_error", ({ message }) => {
            addCC("system", `Error: ${message}`);
            flushTTSBuffer();
            currentAssistantCcIdRef.current = null;
            if (/rate limit|quota/i.test(message)) {
              rateLimitCooldownUntilRef.current = Date.now() + 30000;
            }
          });
          // ai_busy = server is throttling, silently retry after delay
          socket.on("ai_busy", ({ retryAfterMs }) => {
            const text = lastSentTextRef.current;
            if (!text) return;
            clearTimeout(retryTimerRef.current);
            const delay = Math.max(retryAfterMs || 3000, 2000);
            retryTimerRef.current = setTimeout(() => {
              const cid = conversationIdRef.current;
              if (socketRef.current?.connected && cid && text) {
                currentAssistantCcIdRef.current = null;
                socketRef.current.emit("user_utterance", { conversationId: cid, text });
              }
            }, delay);
          });
          socket.on("connect_error", () => {
            addCC("system", "Could not connect to server.");
            setIsConnecting(false);
          });
        }
        if (socketRef.current && !socketRef.current.connected) {
          await new Promise((resolve, reject) => {
            socketRef.current.once("connect", resolve);
            socketRef.current.once("connect_error", reject);
          });
        }
        if (!SpeechRecognitionAPI) {
          addCC("system", "Speech recognition not supported in this browser. Use Chrome or Edge.");
          setIsActive(true);
          setIsConnecting(false);
          return;
        }
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (e) => {
          const last = e.results[e.results.length - 1];
          const transcript = last[0]?.transcript?.trim();
          if (!transcript) return;
          if (last.isFinal) {
            if (isSpeakingRef.current) {
              cancelAllTTS();
              socketRef.current?.emit("stop_generation");
            }
            pendingTranscriptRef.current = (pendingTranscriptRef.current + " " + transcript).trim();
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
              const toSend = pendingTranscriptRef.current;
              pendingTranscriptRef.current = "";
              if (!toSend) return;
              addCC("user", toSend);
              // If in rate-limit cooldown, hold text for silent retry later
              if (Date.now() < rateLimitCooldownUntilRef.current) {
                lastSentTextRef.current = toSend;
                const remaining = rateLimitCooldownUntilRef.current - Date.now();
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = setTimeout(() => {
                  const cid = conversationIdRef.current;
                  if (socketRef.current?.connected && cid && lastSentTextRef.current) {
                    currentAssistantCcIdRef.current = null;
                    socketRef.current.emit("user_utterance", { conversationId: cid, text: lastSentTextRef.current });
                  }
                }, remaining + 500);
                return;
              }
              lastSentTextRef.current = toSend;
              const cid = conversationIdRef.current;
              if (socketRef.current?.connected && cid) {
                currentAssistantCcIdRef.current = null;
                socketRef.current.emit("user_utterance", { conversationId: cid, text: toSend });
              }
            }, 1500);
          }
        };
        recognition.onerror = (e) => {
          if (e.error === "no-speech" || e.error === "aborted") return;
          addCC("system", `Recognition: ${e.error}`);
        };
        // Auto-restart recognition if it stops on its own (silence timeout,
        // browser policy, etc.) — keeps STT alive for the whole conversation.
        recognition.onend = () => {
          if (recognitionRef.current && !isSpeakingRef.current) {
            try {
              recognitionRef.current.start();
            } catch (_) {}
          }
        };
        recognition.start();
        recognitionRef.current = recognition;
        setIsActive(true);
        addCC("system", "🎙️ Listening… Say something.");
        try {
          if (videoRef.current) await videoRef.current.play().catch(() => {});
        } catch (_) {}
      } else {
        addCC("system", "Failed to start conversation.");
      }
    } catch (err) {
      addCC("system", err?.response?.data?.message || "Failed to start conversation.");
    }
    setIsConnecting(false);
  }, [isActive, isConnecting, addCC, speakChunk, flushTTSBuffer, cancelAllTTS]);

  const stopConversation = useCallback(() => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    lastSentTextRef.current = null;
    pendingTranscriptRef.current = "";
    rateLimitCooldownUntilRef.current = 0;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }
    cancelAllTTS();
    const cid = conversationIdRef.current;
    if (cid) {
      axios
        .post(
          `${API_BASE}/api/v1/google-gemini-ai/conversation/end`,
          { conversationId: cid },
          { withCredentials: true }
        )
        .catch(() => {});
      conversationIdRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit("stop_generation");
      socketRef.current.off("ai_token");
      socketRef.current.off("ai_done");
      socketRef.current.off("ai_error");
      socketRef.current.off("ai_busy");
      socketRef.current.off("connect_error");
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsActive(false);
    addCC("system", "⏹️ Stopped.");
  }, [addCC, cancelAllTTS]);

  const toggleConversation = async () => {
    if (isActive) {
      stopConversation();
    } else {
      await startConversation();
    }
  };

  const title = useMemo(() => {
    return user?.name ? `Virtual Assistant for ${user.name}` : "Virtual Assistant";
  }, [user?.name]);

  // Cleanup socket and recognition on unmount
  useEffect(() => {
    return () => {
      clearTimeout(debounceTimerRef.current);
      clearTimeout(retryTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
        recognitionRef.current = null;
      }
      cancelAllTTS();
      if (socketRef.current) {
        socketRef.current.off("ai_token");
        socketRef.current.off("ai_done");
        socketRef.current.off("ai_error");
        socketRef.current.off("ai_busy");
        socketRef.current.off("connect_error");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [cancelAllTTS]);

  const statusAnnouncement = useMemo(() => {
    if (isConnecting) return "Starting.";
    if (isActive && isSpeaking) return "Speaking.";
    if (isActive) return "Listening.";
    return "Tap to start.";
  }, [isConnecting, isActive, isSpeaking]);

  return (
    <main className="min-h-screen w-full overflow-hidden bg-black text-white">
      <div aria-live="polite" aria-atomic="true" className="sr-only" key={statusAnnouncement}>
        {statusAnnouncement}
      </div>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
        <div className="absolute top-24 left-[-120px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-140px] h-[620px] w-[620px] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/65 to-black" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go("/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
          >
            ← Back
          </button>
          <div className="text-right">
            <p className="text-xs font-semibold text-white/70">{title}</p>
            {user?.email ? <p className="text-[11px] text-white/50">{user.email}</p> : null}
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/50" />
              <video
                ref={videoRef}
                src="/talkinghead1.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="h-auto w-full object-cover"
                style={{ maxHeight: "52vh" }}
                aria-label="Virtual assistant avatar"
              />
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
            </div>

            <div className="mt-4 flex flex-col items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleConversation}
                disabled={isConnecting}
                className={[
                  "h-16 w-16 rounded-full border-2 shadow-xl transition-all duration-300 active:scale-[0.98]",
                  // Idle (green)
                  !isActive && !isConnecting &&
                    "border-emerald-400/50 bg-emerald-500/20 text-emerald-300 shadow-emerald-500/20 hover:bg-emerald-500/30 hover:shadow-emerald-500/40",
                  // Connecting (green pulse)
                  isConnecting &&
                    "border-emerald-400/50 bg-emerald-500/20 text-emerald-300 animate-pulse",
                  // Listening (cyan pulse glow)
                  isActive && !isSpeaking &&
                    "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.35)] animate-pulse",
                  // Speaking (fire/orange glow)
                  isActive && isSpeaking &&
                    "border-orange-400/60 bg-orange-500/25 text-orange-200 shadow-[0_0_28px_rgba(251,146,60,0.45)]",
                ].filter(Boolean).join(" ")}
                aria-label={isActive ? "Stop conversation" : "Start conversation"}
              >
                {/* Icon per state */}
                {isConnecting ? (
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                ) : !isActive ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto h-7 w-7">
                    <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
                    <path d="M6 11a1 1 0 0 0-2 0 8 8 0 0 0 7 7.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.07A8 8 0 0 0 20 11a1 1 0 1 0-2 0 6 6 0 0 1-12 0Z" />
                  </svg>
                ) : isSpeaking ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto h-7 w-7">
                    <path d="M12 23c-1.03 0-1.86-.37-2.48-1.1S8.73 20.28 8.43 19h7.14c-.3 1.28-.76 2.17-1.38 2.9S13.03 23 12 23Zm-5-5a.97.97 0 0 1-.71-.29A.97.97 0 0 1 6 17c0-.28.1-.52.29-.71A.97.97 0 0 1 7 16h10c.28 0 .52.1.71.29.2.19.29.43.29.71 0 .28-.1.52-.29.71A.97.97 0 0 1 17 18H7Zm-.35-3C5.69 14.16 5 13.2 4.5 12.12A9.2 9.2 0 0 1 4 9c0-2.22.78-4.1 2.34-5.66S9.78 1 12 1s4.1.78 5.66 2.34S20 6.78 20 9c0 1.08-.17 2.12-.5 3.12-.34 1-.86 1.96-1.57 2.88H6.65Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto h-6 w-6">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                )}
              </button>
              <p className={[
                "text-xs font-semibold transition-colors duration-300",
                isConnecting ? "text-emerald-400/80" :
                isActive && isSpeaking ? "text-orange-300/80" :
                isActive ? "text-cyan-300/80" :
                "text-white/60"
              ].filter(Boolean).join(" ")}>
                {isConnecting
                  ? "Starting..."
                  : isActive && isSpeaking
                  ? "Speaking..."
                  : isActive
                  ? "Listening... tap to stop"
                  : "Tap to start"}
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-extrabold text-white/70">CC / Subtitles</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={testVoice}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:bg-white/10 active:scale-[0.99]"
                  >
                    Test Voice
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      ttsBufferRef.current = "";
                      cancelAllTTS();
                      setCcLines([
                        {
                          id: makeCcId(),
                          who: "assistant",
                          text: "CC cleared. Tap mic to talk.",
                          ts: Date.now(),
                        },
                      ]);
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:bg-white/10 active:scale-[0.99]"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="max-h-56 overflow-auto pr-1">
                {ccLines.map((l) => (
                  <div key={l.id ?? l.ts} className="mb-2 last:mb-0">
                    <p className="text-[11px] font-bold text-white/50">
                      {l.who === "assistant" ? "Assistant" : l.who === "user" ? "You" : "System"}
                    </p>
                    <p className="text-sm text-white/90">{l.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
