"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { io as socketIOClient } from "socket.io-client";
import axios from "axios";
import { useUser } from "../../../../../context/UserContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4040";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ─────────────────────────────────────────────────────────────
// Video Call Room Page (Majubee Theme)
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

  // ── Streams / previews ──────────────────────────────────
  const camVideoRef = useRef(null); // self circle video
  const stageVideoRef = useRef(null); // stage video when pinned
  const audioStreamRef = useRef(null);
  const camStreamRef = useRef(null);

  // ── Screen share refs ─────────────────────────────────
  const screenStreamRef = useRef(null); // local screen share MediaStream
  const screenVideoRef = useRef(null); // <video> for local screen on stage
  const peerConnectionsRef = useRef({}); // { socketId: RTCPeerConnection }
  const remoteScreenVideoRef = useRef(null); // <video> for remote screen on stage

  const [audioStatus, setAudioStatus] = useState("idle"); // idle | loading | ready | denied | error
  const [camStatus, setCamStatus] = useState("idle"); // idle | loading | ready | denied | error
  const [notice, setNotice] = useState("");

  // ── Screen share state ────────────────────────────────
  const [shareOn, setShareOn] = useState(false); // am I currently sharing my screen?
  const [remoteSharer, setRemoteSharer] = useState(null); // { socketId, name } or null
  const [remoteScreenStream, setRemoteScreenStream] = useState(null); // remote MediaStream

  // ── Camera mesh (multi-participant) ───────────────────
  const cameraPeersRef = useRef({}); // { remoteSocketId: RTCPeerConnection }
  const remoteCameraReadyRef = useRef(new Set()); // remote users that emitted camera:ready
  const mediaFlowCompleteRef = useRef(false); // true once local permission flow finishes
  const cameraReadyEmittedRef = useRef(false); // true once we emitted camera:ready
  const [remoteStreams, setRemoteStreams] = useState({}); // { remoteSocketId: MediaStream }
  const [remoteCamStatus, setRemoteCamStatus] = useState({}); // { remoteSocketId: boolean }

  // ── Stage / fullscreen / pin ────────────────────────────
  const stageWrapRef = useRef(null);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [pinnedToStage, setPinnedToStage] = useState(null); // null | "self" | remoteSocketId

  // ── Socket connection ────────────────────────────────────
  const socketRef = useRef(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [mySocketId, setMySocketId] = useState("");

  // ── Participants (driven by socket) ─────────────────────
  const [participants, setParticipants] = useState([]);

  // ── Chat (driven by socket) ─────────────────────────────
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Helper: create a camera peer connection for a remote user ──
  function createCameraPeer(remoteSocketId) {
    if (cameraPeersRef.current[remoteSocketId]) {
      return cameraPeersRef.current[remoteSocketId];
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    cameraPeersRef.current[remoteSocketId] = pc;

    // Add local camera + audio tracks (if available)
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, camStreamRef.current));
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, audioStreamRef.current));
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socketRef.current?.emit("camera:ice-candidate", {
          targetSocketId: remoteSocketId,
          candidate: ev.candidate,
        });
      }
    };

    pc.ontrack = (ev) => {
      console.log("[videocallroom] camera ontrack from", remoteSocketId);
      const [stream] = ev.streams;
      if (stream) {
        setRemoteStreams((prev) => ({ ...prev, [remoteSocketId]: stream }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        console.log("[videocallroom] camera peer failed:", remoteSocketId);
        pc.close();
        delete cameraPeersRef.current[remoteSocketId];
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[remoteSocketId];
          return next;
        });
      }
    };

    return pc;
  }

  function cleanupAllCameraPeers() {
    Object.values(cameraPeersRef.current).forEach((pc) => pc.close());
    cameraPeersRef.current = {};
    remoteCameraReadyRef.current.clear();
    setRemoteStreams({});
  }

  // ── Connect to WebRTC socket + join room + fetch history ─
  useEffect(() => {
    if (!room || !displayName) return;

    // 1) Connect to the webrtc socket on the separate path
    const socket = socketIOClient(API_BASE, {
      path: "/socket.io-webrtc",
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[videocallroom] socket connected:", socket.id);
      setSocketConnected(true);
      setMySocketId(socket.id);

      // 2) Join the room
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

    // 3) Listen for participant updates
    socket.on("room:participants", (payload) => {
      console.log("[videocallroom] room:participants", payload?.participants?.length);
      const participantList = (payload?.participants || []).map((participant) => ({
        id: participant.socketId || participant.userId || participant.name,
        name: participant.name,
        email: participant.email || "",
        online: true,
      }));
      setParticipants(participantList);

      // Cleanup camera peers for participants that have left
      const currentIds = new Set(participantList.map((p) => p.id));
      for (const remoteId of Object.keys(cameraPeersRef.current)) {
        if (!currentIds.has(remoteId)) {
          cameraPeersRef.current[remoteId]?.close();
          delete cameraPeersRef.current[remoteId];
          remoteCameraReadyRef.current.delete(remoteId);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[remoteId];
            return next;
          });
          setRemoteCamStatus((prev) => {
            const next = { ...prev };
            delete next[remoteId];
            return next;
          });
          // Auto-unpin if the departed participant was pinned
          setPinnedToStage((prev) => (prev === remoteId ? null : prev));
        }
      }
    });

    // 4) Listen for chat messages (deduplicate by id)
    socket.on("chat:new", (incoming) => {
      const incomingId = incoming.id || `m-${Date.now()}-${Math.random()}`;
      console.log("[videocallroom] chat:new", incoming?.name, incoming?.text);
      setMessages((previous) => {
        if (previous.some((existing) => existing.id === incomingId)) return previous;
        return [
          ...previous,
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

    // 5) Listen for room notices (join/leave/disconnect)
    socket.on("room:notice", (payload) => {
      const noticeId = `notice-${payload?.ts || Date.now()}-${Math.random()}`;
      console.log("[videocallroom] room:notice:", payload?.text);
      setMessages((previous) => [
        ...previous,
        {
          id: noticeId,
          who: "bot",
          name: "Majubee Bot",
          text: payload?.text || "",
          ts: payload?.ts || Date.now(),
        },
      ]);
    });

    // ── Screen share signaling listeners ──────────────────

    // Someone started sharing (or we just joined and there's an active sharer)
    socket.on("screenshare:started", ({ sharerSocketId, sharerName }) => {
      if (sharerSocketId === socket.id) return; // I'm the sharer, ignore
      console.log("[videocallroom] screenshare:started by", sharerName);
      setRemoteSharer({ socketId: sharerSocketId, name: sharerName });
      // Tell the sharer we want the stream
      socket.emit("signal:viewer-ready", { targetSocketId: sharerSocketId });
    });

    // Screen share stopped
    socket.on("screenshare:stopped", () => {
      console.log("[videocallroom] screenshare:stopped");
      setRemoteSharer(null);
      setRemoteScreenStream(null);
      // Close any viewer-side peer connections
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      peerConnectionsRef.current = {};
      if (remoteScreenVideoRef.current) {
        remoteScreenVideoRef.current.srcObject = null;
      }
    });

    // Server denied our share request (someone else is sharing)
    socket.on("screenshare:denied", ({ reason }) => {
      console.log("[videocallroom] screenshare:denied:", reason);
      setNotice(reason || "Cannot share right now.");
      setShareOn(false);
      // Stop local screen tracks if we started them
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setTimeout(() => setNotice(""), 3000);
    });

    // [SHARER] A viewer is ready to receive our stream
    socket.on("signal:viewer-ready", async ({ viewerSocketId }) => {
      if (!screenStreamRef.current) return;
      console.log("[videocallroom] viewer-ready from", viewerSocketId);
      try {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionsRef.current[viewerSocketId] = pc;

        // Add screen tracks to the connection
        screenStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, screenStreamRef.current);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("signal:ice-candidate", {
              targetSocketId: viewerSocketId,
              candidate: event.candidate,
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            pc.close();
            delete peerConnectionsRef.current[viewerSocketId];
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("signal:offer", {
          targetSocketId: viewerSocketId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.log("[videocallroom] error creating offer for viewer:", err);
      }
    });

    // [VIEWER] Received an offer from the sharer
    socket.on("signal:offer", async ({ senderSocketId, sdp }) => {
      console.log("[videocallroom] signal:offer from", senderSocketId);
      try {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionsRef.current[senderSocketId] = pc;

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("signal:ice-candidate", {
              targetSocketId: senderSocketId,
              candidate: event.candidate,
            });
          }
        };

        pc.ontrack = (event) => {
          console.log("[videocallroom] ontrack — remote screen stream received");
          const [remoteStream] = event.streams;
          if (remoteStream) {
            setRemoteScreenStream(remoteStream);
            // Try to attach immediately if video element exists
            if (remoteScreenVideoRef.current) {
              remoteScreenVideoRef.current.srcObject = remoteStream;
              remoteScreenVideoRef.current.play().catch(() => {});
            }
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            pc.close();
            delete peerConnectionsRef.current[senderSocketId];
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("signal:answer", {
          targetSocketId: senderSocketId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.log("[videocallroom] error handling offer:", err);
      }
    });

    // [SHARER] Received an answer from a viewer
    socket.on("signal:answer", async ({ senderSocketId, sdp }) => {
      console.log("[videocallroom] signal:answer from", senderSocketId);
      const pc = peerConnectionsRef.current[senderSocketId];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.log("[videocallroom] error setting answer:", err);
      }
    });

    // [BOTH] Received an ICE candidate
    socket.on("signal:ice-candidate", async ({ senderSocketId, candidate }) => {
      const pc = peerConnectionsRef.current[senderSocketId];
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.log("[videocallroom] error adding ICE candidate:", err);
      }
    });

    // ── Camera mesh signaling listeners ───────────────────

    // Another user's camera is ready — maybe initiate a connection
    socket.on("camera:user-ready", ({ socketId: remoteId }) => {
      console.log("[videocallroom] camera:user-ready from", remoteId);
      remoteCameraReadyRef.current.add(remoteId);

      // If my media is ready AND I have the lower ID → I create the offer
      if (mediaFlowCompleteRef.current && socket.id < remoteId && !cameraPeersRef.current[remoteId]) {
        (async () => {
          try {
            const pc = createCameraPeer(remoteId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("camera:offer", { targetSocketId: remoteId, sdp: pc.localDescription });
          } catch (err) {
            console.log("[videocallroom] camera offer error:", err);
          }
        })();
      }
    });

    // Server tells us about all currently-ready users when WE emit camera:ready
    socket.on("camera:users-ready", ({ socketIds }) => {
      console.log("[videocallroom] camera:users-ready", socketIds?.length);
      for (const remoteId of socketIds || []) {
        remoteCameraReadyRef.current.add(remoteId);
        if (mediaFlowCompleteRef.current && socket.id < remoteId && !cameraPeersRef.current[remoteId]) {
          (async () => {
            try {
              const pc = createCameraPeer(remoteId);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit("camera:offer", { targetSocketId: remoteId, sdp: pc.localDescription });
            } catch (err) {
              console.log("[videocallroom] camera offer error (users-ready):", err);
            }
          })();
        }
      }
    });

    // Received an offer for camera mesh from another user
    socket.on("camera:offer", async ({ senderSocketId, sdp }) => {
      console.log("[videocallroom] camera:offer from", senderSocketId);
      try {
        const pc = createCameraPeer(senderSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("camera:answer", { targetSocketId: senderSocketId, sdp: pc.localDescription });
      } catch (err) {
        console.log("[videocallroom] camera answer error:", err);
      }
    });

    // Received an answer for camera mesh
    socket.on("camera:answer", async ({ senderSocketId, sdp }) => {
      console.log("[videocallroom] camera:answer from", senderSocketId);
      const pc = cameraPeersRef.current[senderSocketId];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.log("[videocallroom] camera set-answer error:", err);
      }
    });

    // ICE candidate for camera mesh
    socket.on("camera:ice-candidate", async ({ senderSocketId, candidate }) => {
      const pc = cameraPeersRef.current[senderSocketId];
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.log("[videocallroom] camera ICE error:", err);
      }
    });

    // Remote user toggled their camera on/off
    socket.on("camera:cam-toggled", ({ socketId, camOn }) => {
      console.log("[videocallroom] camera:cam-toggled", socketId, camOn);
      setRemoteCamStatus((prev) => ({ ...prev, [socketId]: camOn }));
    });

    // 6) Fetch message history via REST (deduplicate against already-received socket messages)
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
          setMessages((previous) => {
            const existingIds = new Set(previous.map((existing) => existing.id));
            const uniqueHistory = mapped.filter((msg) => !existingIds.has(msg.id));
            return [...uniqueHistory, ...previous];
          });
        }
      })
      .catch((error) => {
        console.log("[videocallroom] fetch history error:", error?.message);
      });

    // 7) Cleanup on unmount
    return () => {
      console.log("[videocallroom] socket cleanup");
      // Stop local screen share if active
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      // Close all screen share peer connections
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      peerConnectionsRef.current = {};
      // Close all camera mesh peer connections
      cleanupAllCameraPeers();

      socket.emit("room:leave", { roomKey: room });
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [room, displayName, email, user?._id]);

  // ── Initials for avatar fallback ────────────────────────
  const initials = useMemo(() => {
    const nameString = (displayName || email || "U").trim();
    const parts = nameString.split(/\s+/).filter(Boolean);
    const firstInitial = parts[0]?.[0] || "U";
    const lastInitial = parts.length > 1 ? parts[1]?.[0] : "";
    return (firstInitial + lastInitial).toUpperCase();
  }, [displayName, email]);

  // ── Navigation ──────────────────────────────────────────
  const go = (path) => {
    console.log("[videocallroom] navigating to:", path);
    router.push(path);
  };

  // ────────────────────────────────────────────────────────
  // Permission flow:
  //   1) after 1s -> request mic (audio)
  //   2) after that completes -> wait 1s -> request camera (video)
  // This makes the browser show prompts sequentially.
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function requestMicThenCam() {
      if (typeof window === "undefined") return;

      const mediaDevices = navigator?.mediaDevices;
      if (!mediaDevices?.getUserMedia) {
        setAudioStatus("error");
        setCamStatus("error");
        setNotice("Camera/mic not supported in this browser.");
        return;
      }

      // 1) Mic prompt (after 1 sec)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (cancelled) return;

      try {
        console.log("[videocallroom] requesting MIC permission...");
        setAudioStatus("loading");
        setNotice("Requesting microphone permission...");

        const audioStream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        if (cancelled) {
          audioStream.getTracks().forEach((track) => track.stop());
          return;
        }

        audioStreamRef.current = audioStream;
        setAudioStatus("ready");
        console.log("[videocallroom] mic ready");
        setNotice("Microphone allowed. Now requesting camera...");
      } catch (error) {
        console.log("[videocallroom] mic permission error:", error);
        const errorName = error?.name || "";
        if (
          errorName === "NotAllowedError" ||
          errorName === "PermissionDeniedError"
        ) {
          setAudioStatus("denied");
          setNotice("Microphone permission denied. Allow mic + refresh.");
        } else {
          setAudioStatus("error");
          setNotice("Could not access microphone. Check browser settings.");
        }
        if (!cancelled) mediaFlowCompleteRef.current = true;
        return; // stop here (don't request camera if mic denied)
      }

      // 2) Camera prompt (after 1 sec)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (cancelled) return;

      try {
        console.log("[videocallroom] requesting CAMERA permission...");
        setCamStatus("loading");

        const camStream = await mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });

        if (cancelled) {
          camStream.getTracks().forEach((track) => track.stop());
          return;
        }

        camStreamRef.current = camStream;
        setCamStatus("ready");
        setNotice("");

        console.log("[videocallroom] camera ready");
      } catch (error) {
        console.log("[videocallroom] camera permission error:", error);
        const errorName = error?.name || "";
        if (
          errorName === "NotAllowedError" ||
          errorName === "PermissionDeniedError"
        ) {
          setCamStatus("denied");
          setNotice("Camera permission denied. Allow camera + refresh.");
        } else {
          setCamStatus("error");
          setNotice("Could not access camera. Check browser settings.");
        }
      }

      // Mark media flow as complete regardless of outcome
      if (!cancelled) mediaFlowCompleteRef.current = true;
    }

    requestMicThenCam();

    return () => {
      cancelled = true;

      if (audioStreamRef.current) {
        console.log("[videocallroom] stopping audio tracks...");
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }

      if (camStreamRef.current) {
        console.log("[videocallroom] stopping camera tracks...");
        camStreamRef.current.getTracks().forEach((track) => track.stop());
        camStreamRef.current = null;
      }
    };
  }, []);

  // Attach camera stream to the circle + stage video if pinned
  useEffect(() => {
    if (camStatus !== "ready" || !camStreamRef.current) return;

    // Circle video
    if (camVideoRef.current) {
      camVideoRef.current.srcObject = camStreamRef.current;
      camVideoRef.current.play().catch(() => {});
    }

    // Stage video if self is pinned
    if (pinnedToStage === "self" && stageVideoRef.current) {
      stageVideoRef.current.srcObject = camStreamRef.current;
      stageVideoRef.current.play().catch(() => {});
    }
  }, [camStatus, pinnedToStage]);

  // ── Attach remote stream to stage when a remote user is pinned ─
  useEffect(() => {
    if (!pinnedToStage || pinnedToStage === "self") return;
    const stream = remoteStreams[pinnedToStage];
    if (stageVideoRef.current && stream) {
      stageVideoRef.current.srcObject = stream;
      stageVideoRef.current.play().catch(() => {});
    }
  }, [pinnedToStage, remoteStreams]);

  // ── Attach local screen share to stage video ──────────
  useEffect(() => {
    if (shareOn && screenStreamRef.current && screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
      screenVideoRef.current.play().catch(() => {});
    }
  }, [shareOn]);

  // ── Attach remote screen share to stage video ─────────
  useEffect(() => {
    if (remoteScreenStream && remoteScreenVideoRef.current) {
      remoteScreenVideoRef.current.srcObject = remoteScreenStream;
      remoteScreenVideoRef.current.play().catch(() => {});
    }
  }, [remoteScreenStream, remoteSharer]);

  // ── Emit camera:ready once media flow completes + socket is connected ─
  useEffect(() => {
    if (cameraReadyEmittedRef.current) return;
    if (!mediaFlowCompleteRef.current) return;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    cameraReadyEmittedRef.current = true;
    console.log("[videocallroom] emitting camera:ready");
    socket.emit("camera:ready", { roomKey: room });

    // Also check if any remote users are already known as ready
    // (they may have sent camera:user-ready before our media was done)
    for (const remoteId of remoteCameraReadyRef.current) {
      if (socket.id < remoteId && !cameraPeersRef.current[remoteId]) {
        (async () => {
          try {
            const pc = createCameraPeer(remoteId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("camera:offer", { targetSocketId: remoteId, sdp: pc.localDescription });
          } catch (err) {
            console.log("[videocallroom] camera offer error (ready-emit):", err);
          }
        })();
      }
    }
  }, [camStatus, audioStatus, socketConnected, room]);

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
        console.log("[videocallroom] socket not connected, cannot send");
        setNotice("Not connected. Trying to reconnect...");
        setTimeout(() => setNotice(""), 2000);
        return;
      }

      console.log("[videocallroom] chat:send", trimmedText);
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
  // Controls (placeholder toggles)
  // ────────────────────────────────────────────────────────
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const toggleMic = () => {
    console.log("[videocallroom] toggle mic. before:", micOn);

    setMicOn((previous) => {
      const next = !previous;

      // actually enable/disable mic track (if available)
      const audioTrack =
        audioStreamRef.current?.getAudioTracks?.()?.[0];
      if (audioTrack) {
        audioTrack.enabled = next;
        console.log("[videocallroom] mic track enabled:", audioTrack.enabled);
      }

      return next;
    });
  };

  const toggleCam = () => {
    console.log("[videocallroom] toggle cam. before:", camOn);

    setCamOn((previous) => {
      const next = !previous;

      // actually enable/disable cam track (if available)
      const videoTrack =
        camStreamRef.current?.getVideoTracks?.()?.[0];
      if (videoTrack) {
        videoTrack.enabled = next;
        console.log("[videocallroom] cam track enabled:", videoTrack.enabled);
      }

      // Notify other participants so they show initials vs video
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit("camera:cam-toggled", { roomKey: room, camOn: next });
      }

      return next;
    });
  };

  const stopScreenShare = useCallback(() => {
    console.log("[videocallroom] stopping screen share");
    // Stop local screen tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    // Close all sharer-side peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};

    setShareOn(false);

    // Notify server
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("screenshare:stop", { roomKey: room });
    }
  }, [room]);

  const toggleShare = async () => {
    console.log("[videocallroom] toggle screenshare. before:", shareOn);

    if (shareOn) {
      stopScreenShare();
      return;
    }

    // Don't allow sharing if someone else is already sharing
    if (remoteSharer) {
      setNotice(`${remoteSharer.name} is already sharing their screen.`);
      setTimeout(() => setNotice(""), 2500);
      return;
    }

    // Start sharing
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false,
      });

      screenStreamRef.current = stream;
      setShareOn(true);

      // Listen for browser's built-in "Stop sharing" button
      const screenTrack = stream.getVideoTracks()[0];
      if (screenTrack) {
        screenTrack.addEventListener("ended", () => {
          stopScreenShare();
        });
      }

      // Notify server (this triggers screenshare:started broadcast to others)
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit("screenshare:start", { roomKey: room });
      }
    } catch (err) {
      console.log("[videocallroom] getDisplayMedia error:", err);
      if (err?.name === "NotAllowedError") {
        setNotice("Screen share cancelled.");
      } else {
        setNotice("Could not start screen share.");
      }
      setTimeout(() => setNotice(""), 2500);
    }
  };

  const openSettings = () => {
    console.log("[videocallroom] settings clicked");
    setNotice("Settings (soon).");
    setTimeout(() => setNotice(""), 1800);
  };

  const leaveRoom = () => {
    console.log("[videocallroom] leave room clicked");
    // Stop screen share if active
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    // Close all screen share peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    // Close all camera mesh peer connections
    cleanupAllCameraPeers();

    if (socketRef.current?.connected) {
      socketRef.current.emit("screenshare:stop", { roomKey: room });
      socketRef.current.emit("room:leave", { roomKey: room });
      socketRef.current.disconnect();
    }
    go("/dashboard/videoscreenshare");
  };

  // ────────────────────────────────────────────────────────
  // Double-click any circle -> pin/unpin to stage
  // id = "self" | remoteSocketId
  // ────────────────────────────────────────────────────────
  const togglePinToStage = (id) => {
    console.log("[videocallroom] toggle pin:", id);
    setPinnedToStage((prev) => (prev === id ? null : id));
  };

  // ────────────────────────────────────────────────────────
  // Fullscreen stage (dblclick or button)
  // ────────────────────────────────────────────────────────
  const enterStageFullscreen = async () => {
    try {
      const stageElement = stageWrapRef.current;
      if (!stageElement) return;
      if (document.fullscreenElement) return;

      console.log("[videocallroom] request fullscreen");
      await stageElement.requestFullscreen();
      setIsStageFullscreen(true);
    } catch (error) {
      console.log("[videocallroom] fullscreen failed:", error?.message);
      setNotice("Fullscreen blocked by browser.");
      setTimeout(() => setNotice(""), 1500);
    }
  };

  const exitStageFullscreen = async () => {
    try {
      if (!document.fullscreenElement) return;
      console.log("[videocallroom] exit fullscreen");
      await document.exitFullscreen();
      setIsStageFullscreen(false);
    } catch (error) {
      console.log("[videocallroom] exit fullscreen failed:", error?.message);
    }
  };

  const toggleStageFullscreen = async () => {
    if (document.fullscreenElement) {
      await exitStageFullscreen();
    } else {
      await enterStageFullscreen();
    }
  };

  // Keep state in sync + ESC support
  useEffect(() => {
    const onFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      console.log("[videocallroom] fullscreen change:", isFullscreen);
      setIsStageFullscreen(isFullscreen);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

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
              {/* Priority 1: local screen share */}
              {shareOn ? (
                <>
                  <video
                    ref={screenVideoRef}
                    muted
                    playsInline
                    className="h-full w-full object-contain"
                    aria-label="Your screen share"
                  />
                  <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-bold text-green-400/90 shadow-lg">
                    You are sharing your screen
                  </div>
                </>
              ) : /* Priority 2: remote screen share */
              remoteSharer ? (
                <>
                  <video
                    ref={remoteScreenVideoRef}
                    playsInline
                    className="h-full w-full object-contain"
                    aria-label={`${remoteSharer.name}'s screen share`}
                  />
                  {!remoteScreenStream && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-white/60">Connecting to screen share...</p>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-bold text-blue-400/90 shadow-lg">
                    {remoteSharer.name} is sharing their screen
                  </div>
                </>
              ) : /* Priority 3: any participant pinned to stage */
              pinnedToStage ? (
                (() => {
                  const isSelf = pinnedToStage === "self";
                  const hasSelfVideo = isSelf && camStatus === "ready" && camOn;
                  const remoteStream = !isSelf ? remoteStreams[pinnedToStage] : null;
                  const remoteCamOn = !isSelf ? remoteCamStatus[pinnedToStage] !== false : true;
                  const hasRemoteVideo = remoteStream?.getVideoTracks()?.length > 0 && remoteCamOn;
                  const pinnedName = isSelf
                    ? displayName
                    : participants.find((p) => p.id === pinnedToStage)?.name || "Unknown";

                  return hasSelfVideo || hasRemoteVideo ? (
                    <>
                      <video
                        ref={stageVideoRef}
                        muted={isSelf}
                        playsInline
                        className="h-full w-full object-cover"
                        aria-label={`${pinnedName}'s video on stage`}
                      />
                      <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-bold text-white/80 shadow-lg">
                        {isSelf ? "You" : pinnedName} (pinned)
                      </div>
                    </>
                  ) : (
                    <div className="px-6 text-center">
                      <p className="text-sm font-bold text-white/85">
                        {pinnedName} (pinned)
                      </p>
                      <p className="mt-1 text-xs text-white/55">
                        Camera not available.
                      </p>
                    </div>
                  );
                })()
              ) : (
                /* Default: empty stage placeholder */
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
                      {camStatus === "ready" && camOn ? (
                        <video
                          ref={camVideoRef}
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                          aria-label="Your camera preview"
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
                  const stream = remoteStreams[p.id];
                  const hasVideo = stream?.getVideoTracks()?.length > 0;
                  const remoteCamOn = remoteCamStatus[p.id] !== false; // default true

                  const isPinned = pinnedToStage === p.id;

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
                            {stream && hasVideo && remoteCamOn ? (
                              <video
                                ref={(el) => {
                                  if (el && stream && el.srcObject !== stream) {
                                    el.srcObject = stream;
                                    el.play().catch(() => {});
                                  }
                                }}
                                autoPlay
                                playsInline
                                className="h-full w-full object-cover"
                                aria-label={`${p.name}'s camera`}
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

                        {/* Hidden audio element — plays remote audio when video is off or unavailable */}
                        {stream && (!hasVideo || !remoteCamOn) && (
                          <audio
                            ref={(el) => {
                              if (el && stream && el.srcObject !== stream) {
                                el.srcObject = stream;
                                el.play().catch(() => {});
                              }
                            }}
                            autoPlay
                            className="hidden"
                          />
                        )}

                        {/* Online dot */}
                        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white/20 bg-black/70 p-0.5 shadow-lg">
                          <div className={`h-full w-full rounded-full ${stream ? "bg-green-400/80" : "bg-yellow-400/70"}`} />
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
                    : remoteSharer
                      ? `${remoteSharer.name} sharing`
                      : "Share Screen"
                }
                onClick={toggleShare}
                active={shareOn}
                disabled={!!remoteSharer && !shareOn}
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
