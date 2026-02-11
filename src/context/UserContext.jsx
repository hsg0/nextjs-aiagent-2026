"use client";

import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4040";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchUser() {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/api/v1/auth/user`, {
        withCredentials: true,
      });
      // getUserData returns { success, message, userData: { userId, name, email, isAccountVerified } }
      if (data?.success && data?.userData) {
        setUser(data.userData);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("[UserContext] failed to fetch user:", err?.response?.data?.message || err.message);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, loading, refetchUser: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within a <UserProvider>");
  }
  return ctx;
}
