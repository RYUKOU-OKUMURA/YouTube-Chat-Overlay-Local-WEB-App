"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { AppState, BroadcastStatus, ChatMessage, Settings, Theme, YouTubeStatus } from "@/types";
import { buildOverlayUrl } from "@/lib/overlayUrl";
import { fetchJson } from "./api";
import type { DashboardState } from "./useAdminDashboardState";

export type SettingsPatch = {
  theme?: Partial<Theme>;
  lastBroadcastUrl?: string;
};

type UseAdminActionsInput = {
  setState: Dispatch<SetStateAction<DashboardState | null>>;
  broadcastUrl: string;
  setBroadcastUrl: Dispatch<SetStateAction<string>>;
  setNotice: (text: string) => void;
};

export function useAdminActions({ setState, broadcastUrl, setBroadcastUrl, setNotice }: UseAdminActionsInput) {
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setNotice(`${label}をコピーしました。`);
  }

  function overlayUrl() {
    if (typeof window === "undefined") return "";
    return buildOverlayUrl(window.location.origin);
  }

  async function patchSettings(patch: SettingsPatch) {
    setBusyAction("settings");
    try {
      const next = await fetchJson<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setState((prev) =>
        prev
          ? {
              ...prev,
              overlay: {
                ...prev.overlay,
                theme: next.theme
              },
              lastBroadcastUrl: next.lastBroadcastUrl ?? prev.lastBroadcastUrl
            }
          : prev
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "設定を保存できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function connectYouTube() {
    setBusyAction("oauth");
    try {
      const result = await fetchJson<{ url: string }>("/api/youtube/auth-url");
      window.location.href = result.url;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "OAuth接続を開始できませんでした。");
      setBusyAction(null);
    }
  }

  async function disconnectYouTube() {
    setBusyAction("oauth");
    try {
      const next = await fetchJson<YouTubeStatus>("/api/youtube/disconnect", { method: "POST" });
      setState((prev) => (prev ? { ...prev, youtubeStatus: next } : prev));
      setNotice("YouTube接続を解除しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "接続解除に失敗しました。");
    } finally {
      setBusyAction(null);
    }
  }

  async function startBroadcast() {
    setBusyAction("broadcast");
    try {
      const nextBroadcastUrl = broadcastUrl.trim();
      const result = await fetchJson<BroadcastStatus>("/api/broadcast/start", {
        method: "POST",
        body: JSON.stringify(nextBroadcastUrl ? { broadcastUrl: nextBroadcastUrl } : {})
      });
      setBroadcastUrl(result.currentBroadcastUrl ?? nextBroadcastUrl);
      setState((prev) => (prev ? { ...prev, broadcastStatus: result, lastBroadcastUrl: result.currentBroadcastUrl ?? nextBroadcastUrl } : prev));
      setNotice("コメント取得を開始しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "コメント取得を開始できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function stopBroadcast() {
    setBusyAction("broadcast");
    try {
      const result = await fetchJson<BroadcastStatus>("/api/broadcast/stop", { method: "POST" });
      setState((prev) => (prev ? { ...prev, broadcastStatus: result } : prev));
      setNotice("コメント取得を停止しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "コメント取得を停止できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshViewerMetrics() {
    setBusyAction("viewer-metrics");
    try {
      const result = await fetchJson<BroadcastStatus>("/api/broadcast/viewers/refresh", { method: "POST" });
      setState((prev) => (prev ? { ...prev, broadcastStatus: result } : prev));
      setNotice("同時視聴者数を更新しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同時視聴者数を更新できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function testMessage(kind: "normal" | "superChat" = "normal") {
    const isSuperChat = kind === "superChat";
    setBusyAction(isSuperChat ? "test-super-chat" : "test");
    try {
      const result = await fetchJson<{ message: ChatMessage; overlay: AppState["overlay"] }>(
        "/api/test-message",
        isSuperChat
          ? {
              method: "POST",
              body: JSON.stringify({ kind: "superChat" })
            }
          : { method: "POST" }
      );
      setState((prev) =>
        prev
          ? {
              ...prev,
              messages: [result.message, ...prev.messages.filter((message) => message.id !== result.message.id)].slice(0, 300),
              superChats: result.message.isSuperChat
                ? [result.message, ...prev.superChats.filter((message) => message.id !== result.message.id)].slice(0, 100)
                : prev.superChats,
              overlay: result.overlay
            }
          : prev
      );
      setNotice(isSuperChat ? "テストスパチャを送信しました。" : "テストコメントを送信しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : isSuperChat ? "テストスパチャを送信できませんでした。" : "テストコメントを送信できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function showMessage(message: ChatMessage) {
    if (message.deletionStatus) {
      setNotice("削除済みコメントはOBSに表示できません。");
      return;
    }

    setBusyAction(`show-${message.id}`);
    try {
      const next = await fetchJson<AppState["overlay"]>(`/api/messages/${message.id}/show`, { method: "POST" });
      setState((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((item) =>
                item.id === message.id ? { ...item, displayedAt: next.currentMessage?.displayedAt ?? new Date().toISOString() } : item
              ),
              superChats: prev.superChats.map((item) =>
                item.id === message.id ? { ...item, displayedAt: next.currentMessage?.displayedAt ?? new Date().toISOString() } : item
              ),
              overlay: next
            }
          : prev
      );
      setNotice("コメントを表示しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "コメントを表示できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function hideOverlay() {
    setBusyAction("hide");
    try {
      const next = await fetchJson<AppState["overlay"]>("/api/overlay/hide", { method: "POST" });
      setState((prev) => (prev ? { ...prev, overlay: next } : prev));
      setNotice("OBS表示を非表示にしました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "OBS表示を非表示にできませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function copyOverlayUrl() {
    await copyText(overlayUrl(), "OBS URL");
  }

  async function copyMessage(message: ChatMessage) {
    await copyText(message.messageText, "コメント");
  }

  return {
    busyAction,
    overlayUrl,
    patchSettings,
    connectYouTube,
    disconnectYouTube,
    startBroadcast,
    stopBroadcast,
    refreshViewerMetrics,
    testMessage,
    showMessage,
    hideOverlay,
    copyOverlayUrl,
    copyMessage
  };
}
