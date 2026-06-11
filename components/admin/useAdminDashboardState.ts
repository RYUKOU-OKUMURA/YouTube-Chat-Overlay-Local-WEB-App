"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { io, type Socket } from "socket.io-client";
import type { AppState, BroadcastStatus, ChatMessage, YouTubeStatus } from "@/types";
import { socketEvents } from "@/types";
import { maxRetainedSuperChats, prioritizeRetainedMessages } from "@/lib/messageRetention";
import { fetchJson } from "./api";

export type DashboardState = {
  messages: ChatMessage[];
  superChats: ChatMessage[];
  overlay: AppState["overlay"];
  youtubeStatus: YouTubeStatus;
  broadcastStatus: BroadcastStatus;
  overlayConnected: boolean;
  lastBroadcastUrl?: string;
};

const socketSyncFallbackDelayMs = 1200;

type UseAdminDashboardStateResult = {
  state: DashboardState | null;
  setState: Dispatch<SetStateAction<DashboardState | null>>;
  socketConnected: boolean;
  lastSyncedAt: string | null;
  broadcastUrl: string;
  setBroadcastUrl: Dispatch<SetStateAction<string>>;
  syncStatus: () => Promise<void>;
};

export function useAdminDashboardState(onNotice: (text: string) => void): UseAdminDashboardStateResult {
  const [state, setState] = useState<DashboardState | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [broadcastUrl, setBroadcastUrl] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const socketSyncVersionRef = useRef(0);
  const onNoticeRef = useRef(onNotice);

  useEffect(() => {
    onNoticeRef.current = onNotice;
  }, [onNotice]);

  const applyAppState = useCallback((nextState: AppState) => {
    const nextBroadcastUrl = nextState.broadcastStatus.currentBroadcastUrl ?? "";
    setLastSyncedAt(new Date().toISOString());
    setState((prev) => ({
      ...(prev ?? {}),
      messages: nextState.messages,
      superChats: nextState.superChats,
      overlay: nextState.overlay,
      youtubeStatus: nextState.youtubeStatus,
      broadcastStatus: nextState.broadcastStatus,
      overlayConnected: nextState.overlayConnected,
      lastBroadcastUrl: nextBroadcastUrl || prev?.lastBroadcastUrl
    }));
    setBroadcastUrl((current) => current || nextBroadcastUrl);
  }, []);

  useEffect(() => {
    let mounted = true;
    let socketSyncReceived = false;
    const fallbackController = new AbortController();

    async function loadFallbackState() {
      if (socketSyncReceived) return;
      const syncVersion = socketSyncVersionRef.current;
      try {
        const nextState = await fetchJson<AppState>("/api/state", { signal: fallbackController.signal });
        if (!mounted || socketSyncReceived || syncVersion !== socketSyncVersionRef.current) return;
        applyAppState(nextState);
      } catch (error) {
        if (!mounted || socketSyncReceived || fallbackController.signal.aborted) return;
        onNoticeRef.current(error instanceof Error ? error.message : "管理画面の状態を読み込めませんでした。");
      }
    }

    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit(socketEvents.adminSubscribe);
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    socket.on(socketEvents.stateSync, (nextState: AppState) => {
      socketSyncReceived = true;
      socketSyncVersionRef.current += 1;
      fallbackController.abort();
      applyAppState(nextState);
    });
    socket.on(socketEvents.commentNew, (message: ChatMessage) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              messages: prioritizeRetainedMessages([
                message,
                ...prev.messages.filter((item) => item.platformMessageId !== message.platformMessageId)
              ]),
              superChats: message.isSuperChat
                ? [message, ...prev.superChats.filter((item) => item.platformMessageId !== message.platformMessageId)].slice(0, maxRetainedSuperChats)
                : prev.superChats
            }
          : prev
      );
    });
    socket.on(socketEvents.commentUpdate, (message: ChatMessage) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((item) =>
                item.platformMessageId === message.platformMessageId ? message : item
              ),
              superChats: prev.superChats.map((item) =>
                item.platformMessageId === message.platformMessageId ? message : item
              ),
              overlay:
                prev.overlay.currentMessage?.platformMessageId === message.platformMessageId
                  ? { ...prev.overlay, currentMessage: null }
                  : prev.overlay
            }
          : prev
      );
    });
    socket.on(socketEvents.broadcastStatus, (broadcastStatus: BroadcastStatus) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              broadcastStatus,
              lastBroadcastUrl: broadcastStatus.currentBroadcastUrl ?? prev.lastBroadcastUrl
            }
          : prev
      );
    });
    socket.on(socketEvents.youtubeStatus, (youtubeStatus: YouTubeStatus) => {
      setState((prev) => (prev ? { ...prev, youtubeStatus } : prev));
    });
    socket.on(socketEvents.overlayConnected, ({ connected }: { connected: boolean }) => {
      setState((prev) => (prev ? { ...prev, overlayConnected: connected } : prev));
    });

    const fallbackTimer = window.setTimeout(() => {
      void loadFallbackState();
    }, socketSyncFallbackDelayMs);

    return () => {
      mounted = false;
      window.clearTimeout(fallbackTimer);
      fallbackController.abort();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyAppState]);

  const syncStatus = useCallback(async () => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit(socketEvents.requestSync);
      return;
    }

    const syncVersion = socketSyncVersionRef.current;
    try {
      const nextState = await fetchJson<AppState>("/api/state");
      if (syncVersion !== socketSyncVersionRef.current) return;
      applyAppState(nextState);
    } catch (error) {
      onNoticeRef.current(error instanceof Error ? error.message : "同期に失敗しました。");
    }
  }, [applyAppState]);

  return {
    state,
    setState,
    socketConnected,
    lastSyncedAt,
    broadcastUrl,
    setBroadcastUrl,
    syncStatus
  };
}
