"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";
import { UserProvider, useUser } from "../../context/UserContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4040";

// Route params + searchParams for downstream use (aligned with getUserData user info)
const PrivateRouteContext = createContext(null);

export function usePrivateRoute() {
  const ctx = useContext(PrivateRouteContext);
  if (!ctx) {
    throw new Error("usePrivateRoute must be used within (private) layout");
  }
  return ctx;
}

// ─── Navbar ────────────────────────────────────────────────
function PrivateNavbar() {
  const router = useRouter();
  const { user, setUser } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const go = (path) => {
    setMenuOpen(false);
    router.push(path);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    try {
      await axios.post(`${API_BASE}/api/v1/auth/logout`, {}, { withCredentials: true });
      setUser(null);
      toast.success("Logged out");
      router.replace("/login");
    } catch (err) {
      console.error("[navbar] logout error:", err);
      toast.error("Logout failed");
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 px-4 py-3 shadow-lg backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        {/* Logo (left) */}
        <button
          type="button"
          onClick={() => go("/dashboard")}
          className="flex items-center gap-2 rounded-xl px-2 py-1 transition hover:bg-white/5 active:scale-[0.99]"
          aria-label="Go to dashboard"
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
          <span className="ml-1 text-lg font-extrabold text-white/90">majubee</span>
        </button>

        {/* Right side: user name + menu trigger */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/90 transition hover:bg-white/10 active:scale-[0.99]"
          >
            <span className="max-w-[120px] truncate sm:max-w-[200px]">
              {user?.name || "Menu"}
            </span>
            <svg
              className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-black/95 shadow-2xl backdrop-blur-xl">
              {/* User info header */}
              <div className="border-b border-white/10 px-4 py-3">
                <p className="truncate text-sm font-bold text-white">{user?.name}</p>
                <p className="truncate text-xs text-white/50">{user?.email}</p>
              </div>

              <div className="py-1">
                <MenuButton onClick={() => go("/dashboard")}>
                  Dashboard
                </MenuButton>
                <MenuButton onClick={() => go("/dashboard/vrassistant")}>
                  Virtual Assistant
                </MenuButton>
                <MenuButton onClick={() => go("/dashboard/videoscreenshare")}>
                  Video Screen Share
                </MenuButton>
              </div>

              <div className="border-t border-white/10 py-1">
                <MenuButton onClick={handleLogout} danger>
                  Logout
                </MenuButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function MenuButton({ children, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center px-4 py-3 text-left text-sm font-medium transition ${
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-white/90 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Private shell (auth guard) ────────────────────────────
function PrivateShell({ children }) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, loading } = useUser();

  useEffect(() => {
    if (!loading && !user) {
      console.log("[private-layout] no user, redirecting to /login");
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="animate-pulse text-sm text-white/70">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <PrivateRouteContext.Provider value={{ params, searchParams }}>
      <div className="min-h-screen w-full bg-black text-white">
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
        />
        <PrivateNavbar />
        <main className="w-full">{children}</main>
      </div>
    </PrivateRouteContext.Provider>
  );
}

// ─── Layout export ─────────────────────────────────────────
export default function PrivateLayout({ children }) {
  return (
    <UserProvider>
      <PrivateShell>{children}</PrivateShell>
    </UserProvider>
  );
}
