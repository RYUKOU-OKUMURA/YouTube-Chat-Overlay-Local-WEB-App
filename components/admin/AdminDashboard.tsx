"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BadgeJapaneseYen, Copy, MonitorCog, RefreshCcw, SlidersHorizontal, TestTube2 } from "lucide-react";
import type { AppState, BroadcastStatus, ChatMessage, Settings, Theme, YouTubeStatus } from "@/types";
import { socketEvents } from "@/types";
import { isImportantMessage, maxRetainedSuperChats, prioritizeRetainedMessages } from "@/lib/messageRetention";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";
import { fetchJson } from "./api";
import { ConnectionStrip } from "./ConnectionStrip";
import { OAuthPanel } from "./OAuthPanel";
import { BroadcastPanel } from "./BroadcastPanel";
import { OverlayPanel } from "./OverlayPanel";
import { BroadcasterCockpit } from "./BroadcasterCockpit";
import { MessagePanel, type CommentView } from "./MessagePanel";
import { SettingsPanel } from "./SettingsPanel";

type DashboardState = {
  overlayToken: string;
  messages: ChatMessage[];
  superChats: ChatMessage[];
  overlay: AppState["overlay"];
  youtubeStatus: YouTubeStatus;
  broadcastStatus: BroadcastStatus;
  overlayConnected: boolean;
  lastBroadcastUrl?: string;
};

type SettingsPatch = {
  theme?: Partial<Theme>;
  lastBroadcastUrl?: string;
};

const socketSyncFallbackDelayMs = 1200;
const compactModeStorageKey = "admin-control-compact-mode";

export function AdminDashboard({ initialNotice }: { initialNotice?: string }) {
  const [state, setState] = useState<DashboardState | null>(null);
  const [activeView, setActiveView] = useState<"control" | "admin">("control");
  const [socketConnected, setSocketConnected] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [broadcastUrl, setBroadcastUrl] = useState("");
  const [search, setSearch] = useState("");
  const [commentView, setCommentView] = useState<CommentView>("all");
  const [compactMode, setCompactModeState] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const socketSyncVersionRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousLatestMessageIdRef = useRef<string | null>(null);
  const messagesInitializedRef = useRef(false);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
      setCompactModeState(window.localStorage.getItem(compactModeStorageKey) === "true");
    });
  }, []);

  const setCompactMode = useCallback((value: boolean) => {
    setCompactModeState(value);
    window.localStorage.setItem(compactModeStorageKey, String(value));
  }, []);

  const applyAppState = useCallback((nextState: AppState) => {
    const nextBroadcastUrl = nextState.broadcastStatus.currentBroadcastUrl ?? "";
    setLastSyncedAt(new Date().toISOString());
    setState((prev) => ({
      ...(prev ?? {}),
      overlayToken: nextState.overlayToken,
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
        setNotice(error instanceof Error ? error.message : "管理画面の状態を読み込めませんでした。");
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

  const jumpToLatest = useCallback(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    setNewMessageCount(0);
  }, []);

  const updateNewMessageCount = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distanceFromBottom < 96) {
      setNewMessageCount(0);
    }
  }, []);

  useEffect(() => {
    if (!state) return;

    const latestMessageId = state.messages[0]?.id ?? null;
    if (!messagesInitializedRef.current) {
      messagesInitializedRef.current = true;
      previousLatestMessageIdRef.current = latestMessageId;
      return;
    }

    if (latestMessageId && latestMessageId !== previousLatestMessageIdRef.current) {
      const previousIndex = previousLatestMessageIdRef.current
        ? state.messages.findIndex((message) => message.id === previousLatestMessageIdRef.current)
        : -1;
      const addedCount = previousIndex > 0 ? previousIndex : 1;
      const list = listRef.current;
      const distanceFromBottom = list ? list.scrollHeight - list.scrollTop - list.clientHeight : 0;

      if (distanceFromBottom >= 96) {
        setNewMessageCount((current) => current + addedCount);
      }
    }

    previousLatestMessageIdRef.current = latestMessageId;
  }, [state]);

  function openThemeSettings() {
    setActiveView("admin");
    window.setTimeout(() => {
      settingsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  const searchMatchedMessages = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = state?.messages ?? [];
    if (!query) return items;
    return items.filter((message) => {
      const haystack = [
        message.authorName,
        message.messageText,
        message.amountText,
        message.messageType,
        message.publishedAt
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [search, state?.messages]);

  const viewCounts = useMemo(
    () => ({
      all: searchMatchedMessages.length,
      undisplayed: searchMatchedMessages.filter((message) => !message.displayedAt).length,
      important: searchMatchedMessages.filter(isImportantMessage).length
    }),
    [searchMatchedMessages]
  );

  const filteredMessages = useMemo(() => {
    if (commentView === "undisplayed") {
      return searchMatchedMessages.filter((message) => !message.displayedAt);
    }
    if (commentView === "important") {
      return searchMatchedMessages.filter(isImportantMessage);
    }
    return searchMatchedMessages;
  }, [commentView, searchMatchedMessages]);

  async function syncStatus() {
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
      setNotice(error instanceof Error ? error.message : "同期に失敗しました。");
    }
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setNotice(`${label}をコピーしました。`);
  }

  function overlayUrl() {
    if (!state) return "";
    return new URL(`/overlay/${state.overlayToken}`, window.location.origin).toString();
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
              overlayToken: next.overlayToken,
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
      const result = await fetchJson<BroadcastStatus>("/api/broadcast/start", {
        method: "POST",
        body: JSON.stringify({ broadcastUrl })
      });
      setState((prev) => (prev ? { ...prev, broadcastStatus: result, lastBroadcastUrl: broadcastUrl } : prev));
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
    if (!state) return;
    await copyText(overlayUrl(), "OBS URL");
  }

  async function copyMessage(message: ChatMessage) {
    await copyText(message.messageText, "コメント");
  }

  const lastSyncLabel = lastSyncedAt ? `同期 ${new Date(lastSyncedAt).toLocaleTimeString()}` : undefined;
  const latestMessageId = state?.messages[0]?.id ?? null;

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <Panel title="管理画面" subtitle="ローカル状態を読み込み中...">
            <div className="text-sm text-slate-500">設定とSocket状態を読み込んでいます。</div>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">配信者用ローカルツール</p>
                <h1 className="truncate text-2xl font-semibold text-slate-950">YouTubeコメントオーバーレイ管理</h1>
                <p className="mt-1 text-sm text-slate-600">
                  配信中のコメント操作と、接続・OBS設定をタブで切り替えます。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icon={<RefreshCcw className="h-4 w-4" />} onClick={syncStatus} variant="ghost">
                  更新
                </Button>
                <Button icon={<TestTube2 className="h-4 w-4" />} onClick={() => testMessage()} disabled={busyAction === "test"}>
                  テストコメント
                </Button>
                <Button
                  icon={<BadgeJapaneseYen className="h-4 w-4" />}
                  onClick={() => testMessage("superChat")}
                  disabled={busyAction === "test-super-chat"}
                >
                  テストスパチャ
                </Button>
                <Button variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={copyOverlayUrl}>
                  OBS URLをコピー
                </Button>
              </div>
            </div>
            <div className="mt-3">
              <ConnectionStrip
                socketConnected={socketConnected}
                overlayConnected={state.overlayConnected}
                youtubeStatus={state.youtubeStatus}
                broadcastStatus={state.broadcastStatus}
                lastSyncLabel={lastSyncLabel}
                onRefresh={syncStatus}
              />
            </div>
            {notice ? (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800" role="status" aria-live="polite">
                {notice}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3" role="tablist" aria-label="管理画面表示切り替え">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "control"}
              onClick={() => setActiveView("control")}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
                activeView === "control"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <MonitorCog className="h-4 w-4" />
              操作画面
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "admin"}
              onClick={() => setActiveView("admin")}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
                activeView === "admin"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              管理・設定
            </button>
          </div>
        </div>

        {activeView === "control" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <MessagePanel
              messages={filteredMessages}
              activeMessage={state.overlay.currentMessage}
              activeMessageId={state.overlay.currentMessage?.id ?? null}
              latestMessageId={latestMessageId}
              search={search}
              setSearch={setSearch}
              commentView={commentView}
              setCommentView={setCommentView}
              onJumpToLatest={jumpToLatest}
              newMessageCount={newMessageCount}
              onListScroll={updateNewMessageCount}
              onOpenThemeSettings={openThemeSettings}
              compactMode={compactMode}
              setCompactMode={setCompactMode}
              onShowMessage={showMessage}
              onHideActiveMessage={hideOverlay}
              onCopyMessage={copyMessage}
              busyAction={busyAction}
              listRef={listRef}
              filteredCount={filteredMessages.length}
              undisplayedCount={viewCounts.undisplayed}
              viewCounts={viewCounts}
            />
            <BroadcasterCockpit
              broadcastStatus={state.broadcastStatus}
              superChats={state.superChats}
              overlay={state.overlay}
              onHide={hideOverlay}
              onRefreshViewerMetrics={refreshViewerMetrics}
              onShowMessage={showMessage}
              onCopyMessage={(message) => {
                const target = message ?? state.overlay.currentMessage;
                if (target) void copyMessage(target);
              }}
              onCopyOverlayUrl={copyOverlayUrl}
              busyAction={busyAction}
              compactMode={compactMode}
            />
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(420px,460px)_minmax(0,1fr)]">
            <div className="grid min-w-0 gap-4">
              <OAuthPanel youtubeStatus={state.youtubeStatus} onConnect={connectYouTube} onDisconnect={disconnectYouTube} busy={busyAction === "oauth"} />
              <BroadcastPanel
                broadcastUrl={broadcastUrl}
                setBroadcastUrl={setBroadcastUrl}
                broadcastStatus={state.broadcastStatus}
                onStart={startBroadcast}
                onStop={stopBroadcast}
                onCopyOverlayUrl={copyOverlayUrl}
                busy={busyAction === "broadcast"}
              />
              <OverlayPanel
                overlay={state.overlay}
                onHide={hideOverlay}
                onCopyMessage={() => {
                  if (state.overlay.currentMessage) void copyMessage(state.overlay.currentMessage);
                }}
                onCopyOverlayUrl={copyOverlayUrl}
              />
            </div>
            <div ref={settingsPanelRef} className="min-w-0 scroll-mt-4">
              <SettingsPanel
                settings={{ theme: state.overlay.theme }}
                onPatchSettings={patchSettings}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
