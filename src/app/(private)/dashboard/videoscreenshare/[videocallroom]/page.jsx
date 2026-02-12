"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { io as socketIOClient } from "socket.io-client";
import axios from "axios";
import { useUser } from "../../../../../context/UserContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4040";
const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || "";
const SCREEN_SHARE_UID_OFFSET = 100000;

// ─────────────────────────────────────────────────────────────
// Video Call Room Page (Majubee Theme) — Agora SDK
// ─────────────────────────────────────────────────────────────
export default function VideoCallRoomPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-black text-white">Loading...</div>}>
      <VideoCallRoomInner />
    </Suspense>
  );
}

function VideoCallRoomInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useUser();

  // ── Route + query data ──────────────────────────────────
  const room = useMemo(() => {
    const raw = params?.videocallroom;
    return Array.isArray(raw) ? raw[0] : raw || "";
  }, [params]);

  const nameFromQuery = searchParams?.get("name") || "";
  const displayName = useMemo(
    () => (nameFromQuery || user?.name || "User").trim(),
    [nameFromQuery, user?.name],
  );
  const email = user?.email || "";

  // ── Agora refs ────────────────────────────────────────────
  const AgoraRTCRef = useRef(null);
  const agoraClientRef = useRef(null);
  const screenClientRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const localScreenTrackRef = useRef(null);
  const agoraJoinedRef = useRef(false);

  // ── Agora state ───────────────────────────────────────────
  const [myAgoraUid, setMyAgoraUid] = useState(0);
  const [remoteUsers, setRemoteUsers] = useState({}); // { [uid]: { videoTrack, audioTrack, hasVideo, hasAudio } }
  const [uidMap, setUidMap] = useState({}); // { [agoraUid]: { socketId, name } }
  const [remoteScreenShare, setRemoteScreenShare] = useState(null); // { uid, videoTrack, audioTrack } or null
  const [localTracksReady, setLocalTracksReady] = useState(false);

  // ── Media status ─────────────────────────────────────────
  const [audioStatus, setAudioStatus] = useState("idle"); // idle | loading | ready | denied | error
  const [camStatus, setCamStatus] = useState("idle");
  const [notice, setNotice] = useState("");

  // ── Screen share state ───────────────────────────────────
  const [shareOn, setShareOn] = useState(false);

  // ── Stage / fullscreen / pin ─────────────────────────────
  const stageWrapRef = useRef(null);
  const selfVideoContainerRef = useRef(null);
  const stageVideoContainerRef = useRef(null);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [pinnedToStage, setPinnedToStage] = useState(null); // null | "self" | remoteSocketId

  // ── Socket connection ────────────────────────────────────
  const socketRef = useRef(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [mySocketId, setMySocketId] = useState("");

  // ── Participants (driven by socket) ──────────────────────
  const [participants, setParticipants] = useState([]);

  // ── Chat (driven by socket) ──────────────────────────────
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Controls ─────────────────────────────────────────────
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  // ── Initials for avatar fallback ─────────────────────────
  const initials = useMemo(() => {
    const nameString = (displayName || email || "U").trim();
    const parts = nameString.split(/\s+/).filter(Boolean);
    const firstInitial = parts[0]?.[0] || "U";
    const lastInitial = parts.length > 1 ? parts[1]?.[0] : "";
    return (firstInitial + lastInitial).toUpperCase();
  }, [displayName, email]);

  const go = (path) => router.push(path);

  // ── Helper: find Agora UID for a socket ID ───────────────
  const getAgoraUidForSocket = useCallback(
    (socketId) => {
      for (const [uid, info] of Object.entries(uidMap)) {
        if (info.socketId === socketId) return Number(uid);
      }
      return null;
    },
    [uidMap],
  );

  // ────────────────────────────────────────────────────────
  // Effect 1: Socket connection + room lifecycle + chat
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!room || !displayName) return;

    const socket = socketIOClient(API_BASE, {
      path: "/socket.io-webrtc",
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[videocallroom] socket connected:", socket.id);
      setSocketConnected(true);
      setMySocketId(socket.id);
      socket.emit("room:join", {
        roomKey: room,
        userId: user?._id || "",
        name: displayName,
        email,
      });
    });

    socket.on("connect_error", (error) => {
      console.log("[videocallroom] socket connect error:", error?.message);
      setSocketConnected(false);
    });

    // Participant updates
    socket.on("room:participants", (payload) => {
      console.log("[videocallroom] room:participants", payload?.participants?.length);
      const participantList = (payload?.participants || []).map((p) => ({
        id: p.socketId || p.userId || p.name,
        name: p.name,
        email: p.email || "",
        online: true,
      }));
      setParticipants(participantList);

      // Unpin if the participant left
      const currentIds = new Set(participantList.map((p) => p.id));
      setPinnedToStage((prev) => {
        if (prev && prev !== "self" && !currentIds.has(prev)) return null;
        return prev;
      });
    });

    // Chat messages (deduplicate by id)
    socket.on("chat:new", (incoming) => {
      const incomingId = incoming.id || `m-${Date.now()}-${Math.random()}`;
      setMessages((prev) => {
        if (prev.some((e) => e.id === incomingId)) return prev;
        return [
          ...prev,
          {
            id: incomingId,
            who: incoming.email === email ? "me" : "user",
            name: incoming.name || "Unknown",
            text: incoming.text || "",
            ts: incoming.ts || Date.now(),
          },
        ];
      });
    });

    // Room notices (join/leave/disconnect)
    socket.on("room:notice", (payload) => {
      const noticeId = `notice-${payload?.ts || Date.now()}-${Math.random()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: noticeId,
          who: "bot",
          name: "Majubee Bot",
          text: payload?.text || "",
          ts: payload?.ts || Date.now(),
        },
      ]);
    });

    // Agora UID mapping from other users
    socket.on("agora:uid-map", ({ socketId, agoraUid, name }) => {
      console.log("[videocallroom] agora:uid-map", { socketId, agoraUid, name });
      setUidMap((prev) => ({ ...prev, [agoraUid]: { socketId, name } }));
    });

    // Fetch message history via REST
    axios
      .get(`${API_BASE}/webrtc/messages/${encodeURIComponent(room)}?limit=100`, {
        withCredentials: true,
      })
      .then((response) => {
        const history = response?.data?.messages || [];
        if (history.length > 0) {
          const mapped = history.map((msg) => ({
            id: msg._id || `hist-${Date.now()}-${Math.random()}`,
            who: msg.sender?.email === email ? "me" : "user",
            name: msg.sender?.name || "Unknown",
            text: msg.text || "",
            ts: msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now(),
          }));
          setMessages((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const unique = mapped.filter((m) => !existingIds.has(m.id));
            return [...unique, ...prev];
          });
        }
      })
      .catch((err) => console.log("[videocallroom] fetch history error:", err?.message));

    // Cleanup on unmount
    return () => {
      console.log("[videocallroom] socket cleanup");
      socket.emit("room:leave", { roomKey: room });
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [room, displayName, email, user?._id]);

  // ────────────────────────────────────────────────────────
  // Effect 2: Agora connection + local tracks
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socketConnected || !room || !mySocketId) return;

    let cancelled = false;

    async function initAgora() {
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        AgoraRTCRef.current = AgoraRTC;

        // Suppress Agora SDK console noise
        AgoraRTC.setLogLevel(3); // WARNING level

        if (cancelled) return;

        // Generate a random UID (1-99999)
        const uid = Math.floor(Math.random() * 99999) + 1;

        // Fetch token from backend
        const tokenRes = await axios.get(
          `${API_BASE}/api/v1/agora/token?channel=${encodeURIComponent(room)}&uid=${uid}`,
          { withCredentials: true },
        );

        if (cancelled) return;
        const { token } = tokenRes.data;

        // Create Agora client
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        agoraClientRef.current = client;

        // ── Remote user event handlers ──
        client.on("user-published", async (remoteUser, mediaType) => {
          const remoteUid = remoteUser.uid;
          console.log("[agora] user-published", remoteUid, mediaType);

          // Screen share user (UID >= offset)
          if (remoteUid >= SCREEN_SHARE_UID_OFFSET) {
            await client.subscribe(remoteUser, mediaType);
            setRemoteScreenShare((prev) => ({
              uid: remoteUid,
              videoTrack: mediaType === "video" ? remoteUser.videoTrack : (prev?.videoTrack || null),
              audioTrack: mediaType === "audio" ? remoteUser.audioTrack : (prev?.audioTrack || null),
            }));
            if (mediaType === "audio" && remoteUser.audioTrack) {
              remoteUser.audioTrack.play();
            }
            return;
          }

          // Normal user
          await client.subscribe(remoteUser, mediaType);
          setRemoteUsers((prev) => ({
            ...prev,
            [remoteUid]: {
              ...prev[remoteUid],
              videoTrack: mediaType === "video" ? remoteUser.videoTrack : (prev[remoteUid]?.videoTrack || null),
              audioTrack: mediaType === "audio" ? remoteUser.audioTrack : (prev[remoteUid]?.audioTrack || null),
              hasVideo: mediaType === "video" ? true : (prev[remoteUid]?.hasVideo || false),
              hasAudio: mediaType === "audio" ? true : (prev[remoteUid]?.hasAudio || false),
            },
          }));
          if (mediaType === "audio" && remoteUser.audioTrack) {
            remoteUser.audioTrack.play();
          }
        });

        client.on("user-unpublished", (remoteUser, mediaType) => {
          const remoteUid = remoteUser.uid;
          console.log("[agora] user-unpublished", remoteUid, mediaType);

          if (remoteUid >= SCREEN_SHARE_UID_OFFSET) {
            if (mediaType === "video") {
              setRemoteScreenShare((prev) =>
                prev?.uid === remoteUid ? { ...prev, videoTrack: null } : prev,
              );
            }
            return;
          }

          setRemoteUsers((prev) => {
            const existing = prev[remoteUid];
            if (!existing) return prev;
            return {
              ...prev,
              [remoteUid]: {
                ...existing,
                videoTrack: mediaType === "video" ? null : existing.videoTrack,
                audioTrack: mediaType === "audio" ? null : existing.audioTrack,
                hasVideo: mediaType === "video" ? false : existing.hasVideo,
                hasAudio: mediaType === "audio" ? false : existing.hasAudio,
              },
            };
          });
        });

        client.on("user-left", (remoteUser) => {
          const remoteUid = remoteUser.uid;
          console.log("[agora] user-left", remoteUid);

          if (remoteUid >= SCREEN_SHARE_UID_OFFSET) {
            setRemoteScreenShare((prev) =>
              prev?.uid === remoteUid ? null : prev,
            );
            return;
          }

          setRemoteUsers((prev) => {
            const next = { ...prev };
            delete next[remoteUid];
            return next;
          });
          setUidMap((prev) => {
            const next = { ...prev };
            delete next[remoteUid];
            return next;
          });
        });

        // Join the Agora channel
        await client.join(AGORA_APP_ID, room, token, uid);
        if (cancelled) {
          await client.leave();
          return;
        }

        agoraJoinedRef.current = true;
        setMyAgoraUid(uid);
        console.log("[agora] joined channel:", room, "uid:", uid);

        // Announce our UID via socket
        socketRef.current?.emit("agora:uid-announce", { roomKey: room, agoraUid: uid });

        // Create local tracks (mic + camera separately for better error handling)
        setAudioStatus("loading");
        setCamStatus("loading");
        setNotice("Requesting microphone and camera...");

        const tracksToPublish = [];

        // 1) Microphone
        try {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          if (cancelled) { audioTrack.close(); return; }
          localAudioTrackRef.current = audioTrack;
          setAudioStatus("ready");
          tracksToPublish.push(audioTrack);
        } catch (micErr) {
          console.log("[agora] mic error:", micErr?.message);
          setAudioStatus("denied");
        }

        // 2) Camera
        try {
          const videoTrack = await AgoraRTC.createCameraVideoTrack();
          if (cancelled) { videoTrack.close(); return; }
          localVideoTrackRef.current = videoTrack;
          setCamStatus("ready");
          tracksToPublish.push(videoTrack);
        } catch (camErr) {
          console.log("[agora] cam error:", camErr?.message);
          setCamStatus("denied");
        }

        if (cancelled) {
          tracksToPublish.forEach((t) => t.close());
          return;
        }

        // Publish whatever tracks succeeded
        if (tracksToPublish.length > 0) {
          await client.publish(tracksToPublish);
          console.log("[agora] published", tracksToPublish.length, "local tracks");
        }

        setLocalTracksReady(true);
        setNotice(
          tracksToPublish.length === 2
            ? ""
            : tracksToPublish.length === 1
              ? "Camera or mic not available. Partial media."
              : "Mic/camera not available.",
        );
      } catch (error) {
        console.log("[agora] init error:", error);
        setNotice("Failed to connect to video service. Check your connection.");
      }
    }

    initAgora();

    return () => {
      cancelled = true;

      // Close local tracks
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.close();
        localVideoTrackRef.current = null;
      }
      if (localScreenTrackRef.current) {
        localScreenTrackRef.current.close();
        localScreenTrackRef.current = null;
      }

      // Leave screen share client
      if (screenClientRef.current) {
        screenClientRef.current.leave().catch(() => {});
        screenClientRef.current = null;
      }

      // Leave main client
      if (agoraClientRef.current) {
        agoraClientRef.current.leave().catch(() => {});
        agoraClientRef.current = null;
      }

      agoraJoinedRef.current = false;
      setLocalTracksReady(false);
      setRemoteUsers({});
      setRemoteScreenShare(null);
    };
  }, [socketConnected, room, mySocketId]);

  // ────────────────────────────────────────────────────────
  // Effect 3: Play local video in self circle or stage
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    const track = localVideoTrackRef.current;
    if (!track || !localTracksReady) return;

    if (!camOn) {
      track.stop();
      return;
    }

    const isScreenShareActive = shareOn || !!remoteScreenShare;
    const shouldPlayOnStage = pinnedToStage === "self" && !isScreenShareActive;

    if (shouldPlayOnStage) {
      const stageEl = stageVideoContainerRef.current;
      if (stageEl) track.play(stageEl, { mirror: true });
    } else {
      const circleEl = selfVideoContainerRef.current;
      if (circleEl) track.play(circleEl, { mirror: true });
    }
  }, [localTracksReady, camOn, pinnedToStage, shareOn, remoteScreenShare]);

  // ────────────────────────────────────────────────────────
  // Effect 4: Play stage content (screen share or pinned remote)
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    const stageEl = stageVideoContainerRef.current;
    if (!stageEl) return;

    // Priority 1: Local screen share
    if (shareOn && localScreenTrackRef.current) {
      localScreenTrackRef.current.play(stageEl);
      return;
    }

    // Priority 2: Remote screen share
    if (remoteScreenShare?.videoTrack) {
      remoteScreenShare.videoTrack.play(stageEl);
      return;
    }

    // Priority 3: Pinned remote participant (self handled in Effect 3)
    if (pinnedToStage && pinnedToStage !== "self") {
      const agoraUid = getAgoraUidForSocket(pinnedToStage);
      if (agoraUid != null && remoteUsers[agoraUid]?.videoTrack) {
        remoteUsers[agoraUid].videoTrack.play(stageEl);
      }
    }
  }, [shareOn, remoteScreenShare, pinnedToStage, remoteUsers, getAgoraUidForSocket]);

  // ────────────────────────────────────────────────────────
  // Effect 5: Play remote video tracks in circle elements
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    for (const [uidStr, remote] of Object.entries(remoteUsers)) {
      if (!remote.videoTrack) continue;
      const uid = Number(uidStr);
      const info = uidMap[uid];
      if (!info?.socketId) continue;

      // Skip if this user is pinned to stage (stage effect handles it)
      const isScreenShareActive = shareOn || !!remoteScreenShare;
      if (!isScreenShareActive && pinnedToStage === info.socketId) continue;

      const circleEl = document.getElementById(`agora-video-${uid}`);
      if (circleEl) {
        remote.videoTrack.play(circleEl);
      }
    }
  }, [remoteUsers, uidMap, pinnedToStage, shareOn, remoteScreenShare, participants]);

  // ────────────────────────────────────────────────────────
  // Chat send (via socket)
  // ────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    (event) => {
      event?.preventDefault?.();
      const trimmedText = chatText.trim();
      if (!trimmedText) return;

      const socket = socketRef.current;
      if (!socket?.connected) {
        setNotice("Not connected. Trying to reconnect...");
        setTimeout(() => setNotice(""), 2000);
        return;
      }

      socket.emit("chat:send", {
        roomKey: room,
        userId: user?._id || "",
        name: displayName,
        email,
        text: trimmedText,
      });
      setChatText("");
    },
    [chatText, room, displayName, email, user?._id],
  );

  // ────────────────────────────────────────────────────────
  // Control functions
  // ────────────────────────────────────────────────────────
  const toggleMic = () => {
    const track = localAudioTrackRef.current;
    if (!track) return;
    const next = !micOn;
    track.setEnabled(next);
    setMicOn(next);
    console.log("[videocallroom] mic toggled:", next);
  };

  const toggleCam = () => {
    const track = localVideoTrackRef.current;
    if (!track) return;
    const next = !camOn;
    track.setEnabled(next);
    setCamOn(next);
    console.log("[videocallroom] cam toggled:", next);
  };

  const stopScreenShare = useCallback(async () => {
    console.log("[videocallroom] stopping screen share");
    if (localScreenTrackRef.current) {
      localScreenTrackRef.current.close();
      localScreenTrackRef.current = null;
    }
    if (screenClientRef.current) {
      try { await screenClientRef.current.leave(); } catch (_) {}
      screenClientRef.current = null;
    }
    setShareOn(false);
  }, []);

  const toggleShare = async () => {
    console.log("[videocallroom] toggle screenshare. before:", shareOn);

    if (shareOn) {
      await stopScreenShare();
      return;
    }

    // Don't allow if someone else is sharing
    if (remoteScreenShare) {
      setNotice("Someone is already sharing their screen.");
      setTimeout(() => setNotice(""), 2500);
      return;
    }

    const AgoraRTC = AgoraRTCRef.current;
    if (!AgoraRTC) {
      setNotice("Video service not ready yet.");
      setTimeout(() => setNotice(""), 2000);
      return;
    }

    try {
      // Create screen track (video only for simplicity)
      const screenTrack = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: "1080p_1" },
        "disable",
      );

      const screenVideoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;
      localScreenTrackRef.current = screenVideoTrack;

      // Listen for browser's built-in "Stop sharing" button
      screenVideoTrack.on("track-ended", () => {
        stopScreenShare();
      });

      // Create second client for screen share
      const screenClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      screenClientRef.current = screenClient;

      const screenUid = myAgoraUid + SCREEN_SHARE_UID_OFFSET;

      // Fetch token for screen share UID
      const tokenRes = await axios.get(
        `${API_BASE}/api/v1/agora/token?channel=${encodeURIComponent(room)}&uid=${screenUid}`,
        { withCredentials: true },
      );
      const { token } = tokenRes.data;

      await screenClient.join(AGORA_APP_ID, room, token, screenUid);

      const tracksToPublish = Array.isArray(screenTrack) ? screenTrack : [screenTrack];
      await screenClient.publish(tracksToPublish);

      setShareOn(true);
      console.log("[agora] screen share published, uid:", screenUid);
    } catch (err) {
      console.log("[agora] screen share error:", err);
      if (err?.name === "NotAllowedError" || err?.code === "PERMISSION_DENIED") {
        setNotice("Screen share cancelled.");
      } else {
        setNotice("Could not start screen share.");
      }
      setTimeout(() => setNotice(""), 2500);

      // Cleanup on error
      if (localScreenTrackRef.current) {
        localScreenTrackRef.current.close();
        localScreenTrackRef.current = null;
      }
      if (screenClientRef.current) {
        try { await screenClientRef.current.leave(); } catch (_) {}
        screenClientRef.current = null;
      }
    }
  };

  const openSettings = () => {
    setNotice("Settings (soon).");
    setTimeout(() => setNotice(""), 1800);
  };

  const leaveRoom = async () => {
    console.log("[videocallroom] leave room");

    // Close local tracks
    localAudioTrackRef.current?.close();
    localVideoTrackRef.current?.close();
    localScreenTrackRef.current?.close();
    localAudioTrackRef.current = null;
    localVideoTrackRef.current = null;
    localScreenTrackRef.current = null;

    // Leave Agora clients
    try { await screenClientRef.current?.leave(); } catch (_) {}
    try { await agoraClientRef.current?.leave(); } catch (_) {}
    screenClientRef.current = null;
    agoraClientRef.current = null;

    // Disconnect socket
    if (socketRef.current?.connected) {
      socketRef.current.emit("room:leave", { roomKey: room });
      socketRef.current.disconnect();
    }

    go("/dashboard/videoscreenshare");
  };

  // ────────────────────────────────────────────────────────
  // Double-click any circle -> pin/unpin to stage
  // ────────────────────────────────────────────────────────
  const togglePinToStage = (id) => {
    console.log("[videocallroom] toggle pin:", id);
    setPinnedToStage((prev) => (prev === id ? null : id));
  };

  // ────────────────────────────────────────────────────────
  // Fullscreen stage
  // ────────────────────────────────────────────────────────
  const enterStageFullscreen = async () => {
    try {
      const stageElement = stageWrapRef.current;
      if (!stageElement) return;
      if (document.fullscreenElement) return;
      await stageElement.requestFullscreen();
      setIsStageFullscreen(true);
    } catch (error) {
      setNotice("Fullscreen blocked by browser.");
      setTimeout(() => setNotice(""), 1500);
    }
  };

  const exitStageFullscreen = async () => {
    try {
      if (!document.fullscreenElement) return;
      await document.exitFullscreen();
      setIsStageFullscreen(false);
    } catch (_) {}
  };

  const toggleStageFullscreen = async () => {
    if (document.fullscreenElement) {
      await exitStageFullscreen();
    } else {
      await enterStageFullscreen();
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => setIsStageFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // ── beforeunload: best-effort Agora cleanup on tab/browser close ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      localAudioTrackRef.current?.close();
      localVideoTrackRef.current?.close();
      localScreenTrackRef.current?.close();
      screenClientRef.current?.leave().catch(() => {});
      agoraClientRef.current?.leave().catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ── Helper: determine what's on stage ────────────────────
  const stageContent = useMemo(() => {
    if (shareOn) return "local-screen";
    if (remoteScreenShare?.videoTrack) return "remote-screen";
    if (pinnedToStage) return "pinned";
    return "empty";
  }, [shareOn, remoteScreenShare, pinnedToStage]);

  // ── Helper: get remote screen sharer name ────────────────
  const remoteScreenSharerName = useMemo(() => {
    if (!remoteScreenShare) return "";
    const sharerMainUid = remoteScreenShare.uid - SCREEN_SHARE_UID_OFFSET;
    return uidMap[sharerMainUid]?.name || "Someone";
  }, [remoteScreenShare, uidMap]);

  // ── Helper: check if a pinned user has video ─────────────
  const pinnedHasVideo = useMemo(() => {
    if (!pinnedToStage) return false;
    if (pinnedToStage === "self") return camStatus === "ready" && camOn;
    const agoraUid = getAgoraUidForSocket(pinnedToStage);
    if (agoraUid == null) return false;
    return !!remoteUsers[agoraUid]?.hasVideo;
  }, [pinnedToStage, camStatus, camOn, remoteUsers, getAgoraUidForSocket]);

  const pinnedName = useMemo(() => {
    if (!pinnedToStage) return "";
    if (pinnedToStage === "self") return displayName;
    return participants.find((p) => p.id === pinnedToStage)?.name || "Unknown";
  }, [pinnedToStage, displayName, participants]);

  // ────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen w-full overflow-hidden bg-black text-white">
      {/* Background gradients (majubee theme) */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
        <div className="absolute top-24 left-[-120px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-140px] h-[620px] w-[620px] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/65 to-black" />
      </div>

      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="relative mx-auto w-full max-w-[1600px] px-3 pt-4 sm:px-4 sm:pt-6">
        <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
          <button
            type="button"
            onClick={() => go("/dashboard/videoscreenshare")}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
          >
            ← Back
          </button>

          <div className="text-right">
            <p className="text-xs font-semibold text-white/70">
              Room:{" "}
              <span className="text-white/90">
                {room || "(missing room)"}
              </span>
            </p>
            <p className="text-[11px] text-white/50">
              {displayName}
              {email ? ` · ${email}` : ""}
            </p>
          </div>
        </div>

        {/* Notice banner */}
        {notice ? (
          <div className="mb-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 sm:mb-4">
            <p className="text-sm font-semibold text-white/90">Notice</p>
            <p className="mt-1 text-sm text-white/70">{notice}</p>
          </div>
        ) : null}
      </div>

      {/* ── 3-column layout (thin left, wide center) ─────── */}
      <div className="relative mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-3 px-3 pb-4 sm:px-4 sm:pb-6 lg:grid-cols-[220px_minmax(0,1fr)_280px] xl:grid-cols-[200px_minmax(0,1fr)_300px]">
        {/* ─── LEFT: Participants (thin) ─────────────────── */}
        <aside className="order-2 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl lg:order-1">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-extrabold text-white/90">
              Participants
            </p>
            <span className="rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-xs font-bold text-white/70">
              {participants.length}
            </span>
          </div>

          <div className="space-y-2">
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    participant.online ? "bg-green-400/80" : "bg-white/20"
                  }`}
                />
                <p className="truncate text-sm font-semibold text-white/85">
                  {participant.name}
                </p>
              </div>
            ))}
          </div>

          {participants.length === 0 && (
            <p className="mt-1 text-xs text-white/40">No participants yet.</p>
          )}

          <p className="mt-3 text-[11px] text-white/50">
            {socketConnected ? "Connected" : "Connecting..."}
          </p>
        </aside>

        {/* ─── CENTER: Stage (wide) ───────────────────────── */}
        <section className="order-1 rounded-3xl border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur-xl sm:p-4 lg:order-2">
          {/* Stage wrapper */}
          <div
            ref={stageWrapRef}
            onDoubleClick={toggleStageFullscreen}
            className={`relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 ${
              isStageFullscreen ? "flex h-screen w-screen flex-col" : ""
            }`}
          >
            {/* subtle overlay */}
            <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/10 via-transparent to-black/50" />

            {/* top-right stage controls */}
            <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
              <MiniButton
                label={isStageFullscreen ? "Exit fullscreen" : "Fullscreen"}
                onClick={toggleStageFullscreen}
                icon={isStageFullscreen ? "🗗" : "🗖"}
              />
              <MiniButton
                label={pinnedToStage ? "Unpin" : "Pin self"}
                onClick={() => pinnedToStage ? setPinnedToStage(null) : setPinnedToStage("self")}
                icon={pinnedToStage ? "📌" : "📍"}
              />
            </div>

            {/* Stage area */}
            <div
              className={`relative flex w-full items-center justify-center ${
                isStageFullscreen
                  ? "h-full flex-1"
                  : "h-[46vh] min-h-[260px] sm:h-[54vh]"
              }`}
            >
              {/* Agora video container for stage (always mounted, visibility controlled) */}
              <div
                ref={stageVideoContainerRef}
                className="h-full w-full"
                style={{
                  display: stageContent !== "empty" && (stageContent !== "pinned" || pinnedHasVideo) ? "block" : "none",
                }}
              />

              {/* Stage labels / overlays */}
              {stageContent === "local-screen" && (
                <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-bold text-green-400/90 shadow-lg">
                  You are sharing your screen
                </div>
              )}

              {stageContent === "remote-screen" && (
                <>
                  {!remoteScreenShare?.videoTrack && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-white/60">Connecting to screen share...</p>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-bold text-blue-400/90 shadow-lg">
                    {remoteScreenSharerName} is sharing their screen
                  </div>
                </>
              )}

              {stageContent === "pinned" && pinnedHasVideo && (
                <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-bold text-white/80 shadow-lg">
                  {pinnedToStage === "self" ? "You" : pinnedName} (pinned)
                </div>
              )}

              {stageContent === "pinned" && !pinnedHasVideo && (
                <div className="px-6 text-center">
                  <p className="text-sm font-bold text-white/85">
                    {pinnedName} (pinned)
                  </p>
                  <p className="mt-1 text-xs text-white/55">
                    Camera not available.
                  </p>
                </div>
              )}

              {stageContent === "empty" && (
                <div className="px-6 text-center">
                  <p className="text-sm font-bold text-white/85">
                    Screen Share Area
                  </p>
                  <p className="mt-1 text-xs text-white/55">
                    Double-click to fullscreen. Click &ldquo;Share Screen&rdquo; to
                    broadcast your screen.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Participant circles + controls */}
          <div className="relative mt-4 flex flex-col items-center justify-center">
            {/* Circles row — self + remote participants */}
            <div className="flex items-end justify-center gap-4 overflow-x-auto px-2 pb-2">
              {/* ─ Self circle ─ */}
              <div className="flex shrink-0 flex-col items-center">
                <div className="relative">
                  <button
                    type="button"
                    onDoubleClick={() => togglePinToStage("self")}
                    className="group relative"
                    aria-label="Your camera (double click to pin to stage)"
                    title="Double click to pin/unpin"
                  >
                    <div className={`h-20 w-20 overflow-hidden rounded-full border-2 bg-white/10 shadow-2xl sm:h-24 sm:w-24 ${
                      pinnedToStage === "self" ? "border-green-400/60 ring-2 ring-green-400/30" : "border-purple-400/40"
                    }`}>
                      {camStatus === "ready" && camOn && !(pinnedToStage === "self" && stageContent === "pinned") ? (
                        <div
                          ref={selfVideoContainerRef}
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-linear-to-b from-white/10 to-white/5">
                          <span className="text-lg font-extrabold text-white/90 sm:text-xl">
                            {initials}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Status dot */}
                  <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white/20 bg-black/70 p-0.5 shadow-lg">
                    <div
                      className={`h-full w-full rounded-full ${
                        camStatus === "ready" && audioStatus === "ready"
                          ? "bg-green-400/80"
                          : camStatus === "loading" || audioStatus === "loading"
                            ? "bg-yellow-400/70"
                            : "bg-red-400/80"
                      }`}
                    />
                  </div>
                </div>
                <p className="mt-1.5 max-w-[96px] truncate text-center text-[11px] font-semibold text-purple-300/80">
                  You
                </p>
              </div>

              {/* ─ Remote participant circles ─ */}
              {participants
                .filter((p) => p.id !== mySocketId)
                .map((p) => {
                  const pInitials = (() => {
                    const parts = (p.name || "U").trim().split(/\s+/).filter(Boolean);
                    return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
                  })();
                  const agoraUid = getAgoraUidForSocket(p.id);
                  const remote = agoraUid != null ? remoteUsers[agoraUid] : null;
                  const hasVideo = !!remote?.hasVideo;
                  const isPinned = pinnedToStage === p.id;
                  const showVideoInCircle = hasVideo && !(isPinned && stageContent === "pinned");

                  return (
                    <div key={p.id} className="flex shrink-0 flex-col items-center">
                      <div className="relative">
                        <button
                          type="button"
                          onDoubleClick={() => togglePinToStage(p.id)}
                          className="group relative"
                          aria-label={`${p.name}'s camera (double click to pin)`}
                          title="Double click to pin/unpin"
                        >
                          <div className={`h-20 w-20 overflow-hidden rounded-full border-2 bg-white/10 shadow-2xl sm:h-24 sm:w-24 ${
                            isPinned ? "border-green-400/60 ring-2 ring-green-400/30" : "border-white/20"
                          }`}>
                            {showVideoInCircle ? (
                              <div
                                id={agoraUid != null ? `agora-video-${agoraUid}` : undefined}
                                className="h-full w-full"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-linear-to-b from-white/10 to-white/5">
                                <span className="text-lg font-extrabold text-white/90 sm:text-xl">
                                  {pInitials}
                                </span>
                              </div>
                            )}
                          </div>
                        </button>

                        {/* Online dot */}
                        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white/20 bg-black/70 p-0.5 shadow-lg">
                          <div className={`h-full w-full rounded-full ${remote ? "bg-green-400/80" : "bg-yellow-400/70"}`} />
                        </div>
                      </div>
                      <p className="mt-1.5 max-w-[96px] truncate text-center text-[11px] font-semibold text-white/70">
                        {p.name}
                      </p>
                    </div>
                  );
                })}
            </div>

            {/* Control bar (wraps on mobile) */}
            <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 shadow-xl">
              <CtrlButton
                label={micOn ? "Mute" : "Unmute"}
                onClick={toggleMic}
                active={micOn}
                icon="🎙️"
              />
              <CtrlButton
                label={camOn ? "Camera Off" : "Camera On"}
                onClick={toggleCam}
                active={camOn}
                icon="📷"
              />
              <CtrlButton
                label={
                  shareOn
                    ? "Stop Share"
                    : remoteScreenShare
                      ? `${remoteScreenSharerName} sharing`
                      : "Share Screen"
                }
                onClick={toggleShare}
                active={shareOn}
                disabled={!!remoteScreenShare && !shareOn}
                icon="🖥️"
              />
              <CtrlButton
                label={isStageFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                onClick={toggleStageFullscreen}
                active={isStageFullscreen}
                icon={isStageFullscreen ? "🗗" : "⛶"}
              />
              <CtrlButton
                label="Settings"
                onClick={openSettings}
                active
                icon="⚙️"
              />
              <CtrlButton
                label="Leave"
                onClick={leaveRoom}
                danger
                icon="🚪"
              />
            </div>

            {/* Permission note */}
            {(audioStatus === "denied" ||
              camStatus === "denied" ||
              audioStatus === "error" ||
              camStatus === "error") && (
              <p className="mt-3 text-center text-xs text-white/60">
                {audioStatus === "denied"
                  ? "Microphone permission denied. Allow mic and refresh."
                  : camStatus === "denied"
                    ? "Camera permission denied. Allow camera and refresh."
                    : "Mic/camera not available in this browser."}
              </p>
            )}
          </div>
        </section>

        {/* ─── RIGHT: Chat ────────────────────────────────── */}
        <aside className="order-3 flex flex-col rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl lg:max-h-[calc(100vh-120px)]">
          {/* Header */}
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-extrabold text-white/90">Room Chat</p>
            <p className="text-[11px] text-white/50">
              Type messages while in the call.
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-4 py-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="flex gap-2">
                  <div className="mt-1 h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30">
                    <div className="flex h-full w-full items-center justify-center text-xs font-extrabold text-white/80">
                      {message.who === "bot"
                        ? "🤖"
                        : message.who === "me"
                          ? "🧑"
                          : "👤"}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white/70">
                      {message.name}
                    </p>
                    <p className="mt-1 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90">
                      {message.text}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="border-t border-white/10 p-4">
            <div className="flex items-center gap-2">
              <input
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                placeholder="Send a message..."
                className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/30 focus:ring-1 focus:ring-white/20"
              />
              <button
                type="submit"
                className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-black shadow-lg transition hover:bg-white/90 active:scale-[0.99]"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-[11px] text-white/50">
              {socketConnected
                ? "Connected. Messages broadcast to everyone in the room."
                : "Connecting to chat..."}
            </p>
          </form>
        </aside>
      </div>
    </main>
  );
}

// ─── Control button ───────────────────────────────────────────
function CtrlButton({ label, onClick, icon, active = false, danger = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={`flex h-12 w-12 items-center justify-center rounded-xl border text-lg shadow-lg transition active:scale-[0.98] ${
        disabled
          ? "cursor-not-allowed border-white/5 bg-white/5 text-white/30"
          : danger
            ? "border-red-500/30 bg-red-500/10 hover:bg-red-500/15"
            : active
              ? "border-white/20 bg-white text-black"
              : "border-white/10 bg-white/5 text-white hover:bg-white/10"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

// Small top-right stage buttons
function MiniButton({ label, onClick, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-bold text-white/80 shadow-lg transition hover:bg-black/40 active:scale-[0.99]"
    >
      <span className="mr-2" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}
