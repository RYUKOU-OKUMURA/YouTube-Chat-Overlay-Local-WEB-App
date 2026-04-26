"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Copy, MonitorCog, RefreshCcw, SlidersHorizontal, TestTube2 } from "lucide-react";
import type { AppState, BroadcastStatus, ChatMessage, Settings, Theme, YouTubeStatus } from "@/types";
import { defaultTheme, socketEvents } from "@/types";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";
import { fetchJson } from "./api";
import { ConnectionStrip } from "./ConnectionStrip";
import { OAuthPanel } from "./OAuthPanel";
import { BroadcastPanel } from "./BroadcastPanel";
import { OverlayPanel } from "./OverlayPanel";
import { MessagePanel } from "./MessagePanel";
import { SettingsPanel } from "./SettingsPanel";

type DashboardState = {
  overlayToken: string;
  messages: ChatMessage[];
  overlay: AppState["overlay"];
  youtubeStatus: YouTubeStatus;
  broadcastStatus: BroadcastStatus;
  overlayConnected: boolean;
  lastBroadcastUrl?: string;
};

type SettingsPatch = {
  displayDurationSec?: number;
  theme?: Partial<Theme>;
  lastBroadcastUrl?: string;
};

const emptyOverlay: AppState["overlay"] = {
  currentMessage: null,
  isPinned: false,
  displayDurationSec: 8,
  theme: defaultTheme
};

export function AdminDashboard({ initialNotice }: { initialNotice?: string }) {
  const [state, setState] = useState<DashboardState | null>(null);
  const [activeView, setActiveView] = useState<"control" | "admin">("control");
  const [socketConnected, setSocketConnected] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [broadcastUrl, setBroadcastUrl] = useState("");
  const [search, setSearch] = useState("");
  const [autoscroll, setAutoscroll] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadInitialState() {
      try {
        const [settings, messages, youtubeStatus, broadcastStatus] = await Promise.all([
          fetchJson<Settings>("/api/settings"),
          fetchJson<ChatMessage[]>("/api/messages"),
          fetchJson<YouTubeStatus>("/api/youtube/status"),
          fetchJson<BroadcastStatus>("/api/broadcast/status")
        ]);

        if (!mounted) return;
        setState({
          overlayToken: settings.overlayToken,
          messages,
          overlay: {
          ...emptyOverlay,
          displayDurationSec: settings.displayDurationSec,
          theme: settings.theme
          },
          youtubeStatus,
          broadcastStatus,
          overlayConnected: false,
          lastBroadcastUrl: settings.lastBroadcastUrl
        });
        setBroadcastUrl(settings.lastBroadcastUrl ?? "");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "管理画面の状態を読み込めませんでした。");
      }
    }

    void loadInitialState();

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
      setLastSyncedAt(new Date().toISOString());
      setState((prev) => {
        if (!prev) {
          return {
            overlayToken: nextState.overlayToken,
            messages: nextState.messages,
            overlay: nextState.overlay,
            youtubeStatus: nextState.youtubeStatus,
            broadcastStatus: nextState.broadcastStatus,
            overlayConnected: nextState.overlayConnected,
            lastBroadcastUrl: undefined
          };
        }
        return {
          ...prev,
          overlayToken: nextState.overlayToken,
          messages: nextState.messages,
          overlay: nextState.overlay,
          youtubeStatus: nextState.youtubeStatus,
          broadcastStatus: nextState.broadcastStatus,
          overlayConnected: nextState.overlayConnected
        };
      });
    });

    return () => {
      mounted = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!autoscroll || !listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [autoscroll, state?.messages.length, search]);

  const filteredMessages = useMemo(() => {
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

  async function syncStatus() {
    try {
      const [youtubeStatus, broadcastStatus] = await Promise.all([
        fetchJson<YouTubeStatus>("/api/youtube/status"),
        fetchJson<BroadcastStatus>("/api/broadcast/status")
      ]);
      setState((prev) => (prev ? { ...prev, youtubeStatus, broadcastStatus } : prev));
      setLastSyncedAt(new Date().toISOString());
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
                displayDurationSec: next.displayDurationSec,
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

  async function testMessage() {
    setBusyAction("test");
    try {
      const result = await fetchJson<{ message: ChatMessage; overlay: AppState["overlay"] }>("/api/test-message", { method: "POST" });
      setState((prev) =>
        prev
          ? {
              ...prev,
              messages: [result.message, ...prev.messages.filter((message) => message.id !== result.message.id)].slice(0, 300),
              overlay: result.overlay
            }
          : prev
      );
      setNotice("テストコメントを送信しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "テストコメントを送信できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function showMessage(message: ChatMessage) {
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
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
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
              <Button icon={<TestTube2 className="h-4 w-4" />} onClick={testMessage} disabled={busyAction === "test"}>
                テストコメント
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
          {notice ? <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">{notice}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
            <button
              type="button"
              onClick={() => setActiveView("control")}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition ${
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
              onClick={() => setActiveView("admin")}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition ${
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
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <MessagePanel
              messages={filteredMessages}
              activeMessageId={state.overlay.currentMessage?.id ?? null}
              search={search}
              setSearch={setSearch}
              autoscroll={autoscroll}
              setAutoscroll={setAutoscroll}
              onShowMessage={showMessage}
              onCopyMessage={copyMessage}
              listRef={listRef}
              filteredCount={filteredMessages.length}
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
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="grid gap-4">
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
            <SettingsPanel
              settings={{ theme: state.overlay.theme }}
              onPatchSettings={patchSettings}
            />
          </div>
        )}
      </div>
    </div>
  );
}
