"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeJapaneseYen, Copy, MonitorCog, RefreshCcw, SlidersHorizontal, TestTube2 } from "lucide-react";
import { isImportantMessage } from "@/lib/messageRetention";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";
import { ConnectionStrip } from "./ConnectionStrip";
import { OAuthPanel } from "./OAuthPanel";
import { BroadcastPanel } from "./BroadcastPanel";
import { OverlayPanel } from "./OverlayPanel";
import { BroadcasterCockpit } from "./BroadcasterCockpit";
import { MessagePanel, type CommentView } from "./MessagePanel";
import { SettingsPanel } from "./SettingsPanel";
import { useAdminDashboardState } from "./useAdminDashboardState";
import { useAdminActions } from "./useAdminActions";

const compactModeStorageKey = "admin-control-compact-mode";

export function AdminDashboard({ initialNotice }: { initialNotice?: string }) {
  const [notice, setNotice] = useState(initialNotice);
  const [activeView, setActiveView] = useState<"control" | "admin">("control");
  const [search, setSearch] = useState("");
  const [commentView, setCommentView] = useState<CommentView>("all");
  const [compactMode, setCompactModeState] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousLatestMessageIdRef = useRef<string | null>(null);
  const messagesInitializedRef = useRef(false);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);

  const { state, setState, socketConnected, lastSyncedAt, broadcastUrl, setBroadcastUrl, syncStatus } =
    useAdminDashboardState(setNotice);
  const {
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
  } = useAdminActions({ setState, broadcastUrl, setBroadcastUrl, setNotice });

  useEffect(() => {
    window.queueMicrotask(() => {
      setCompactModeState(window.localStorage.getItem(compactModeStorageKey) === "true");
    });
  }, []);

  const setCompactMode = useCallback((value: boolean) => {
    setCompactModeState(value);
    window.localStorage.setItem(compactModeStorageKey, String(value));
  }, []);

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
                overlayUrl={overlayUrl()}
                onCopyOverlayUrl={copyOverlayUrl}
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
