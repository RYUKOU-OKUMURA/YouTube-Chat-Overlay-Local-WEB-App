import { useMemo, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ArrowDownToLine, Copy, EyeOff, Palette, Play, Rows3, Search, Star, X } from "lucide-react";
import type { ChatMessage } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { cn } from "@/components/common/cn";

export type CommentView = "all" | "undisplayed" | "important";

function formatPaidEventLabel(message: ChatMessage) {
  return message.messageType === "superStickerEvent" ? "Super Sticker" : "Super Chat";
}

function isPaidEvent(message: ChatMessage) {
  return message.isSuperChat || message.messageType === "superStickerEvent";
}

function formatMessageMeta(message: ChatMessage) {
  if (message.deletionStatus === "deleted") return "削除済み";
  if (message.deletionStatus === "retracted") return "投稿者取消";

  const tags = [
    message.isOwner ? "配信者" : null,
    message.isModerator ? "モデレーター" : null,
    message.isMember ? "メンバー" : null,
    isPaidEvent(message) ? formatPaidEventLabel(message) : null
  ].filter(Boolean);
  if (tags.length) return tags.join(" · ");
  if (message.messageType === "testMessage") return "テスト";
  if (message.messageType === "textMessageEvent") return "通常";
  return message.messageType;
}

function authorInitials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "YT";
}

function formatChatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isImportantMessage(message: ChatMessage) {
  return message.isSuperChat || message.isMember || message.isModerator || message.isOwner;
}

function deletionLabel(message: ChatMessage) {
  if (message.deletionStatus === "deleted") return "削除済み";
  if (message.deletionStatus === "retracted") return "取消済み";
  return null;
}

const messagePreviewStyle: CSSProperties = {
  display: "-webkit-box",
  overflow: "hidden",
  overflowWrap: "anywhere",
  wordBreak: "normal",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 4
};

const compactMessagePreviewStyle: CSSProperties = {
  ...messagePreviewStyle,
  WebkitLineClamp: 3
};

const messageRowStyle: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "86px"
};

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

export function MessagePanel({
  messages,
  activeMessage,
  activeMessageId,
  latestMessageId,
  search,
  setSearch,
  commentView,
  setCommentView,
  onJumpToLatest,
  newMessageCount,
  onListScroll,
  onOpenThemeSettings,
  compactMode,
  setCompactMode,
  onShowMessage,
  onHideActiveMessage,
  onCopyMessage,
  busyAction,
  listRef,
  filteredCount,
  undisplayedCount,
  viewCounts
}: {
  messages: ChatMessage[];
  activeMessage: ChatMessage | null;
  activeMessageId: string | null;
  latestMessageId: string | null;
  search: string;
  setSearch: (value: string) => void;
  commentView: CommentView;
  setCommentView: (value: CommentView) => void;
  onJumpToLatest: () => void;
  newMessageCount: number;
  onListScroll: () => void;
  onOpenThemeSettings: () => void;
  compactMode: boolean;
  setCompactMode: (value: boolean) => void;
  onShowMessage: (message: ChatMessage) => void;
  onHideActiveMessage: () => void;
  onCopyMessage: (message: ChatMessage) => void;
  busyAction: string | null;
  listRef: RefObject<HTMLDivElement | null>;
  filteredCount: number;
  undisplayedCount: number;
  viewCounts: Record<CommentView, number>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const orderedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const showSearch = searchOpen || Boolean(search);
  const viewOptions: Array<{ value: CommentView; label: string }> = [
    { value: "undisplayed", label: "未表示" },
    { value: "all", label: "すべて" },
    { value: "important", label: "重要" }
  ];

  return (
    <section className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm", compactMode && "border-slate-300")}>
      <div className={cn("border-b border-slate-200 px-4 py-3", compactMode && "px-3 py-2")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-slate-900">ライブチャット</h2>
              <Badge tone={undisplayedCount > 0 ? "amber" : "slate"}>{`未表示 ${undisplayedCount}`}</Badge>
              <Badge tone="slate">{`現在 ${filteredCount}`}</Badge>
            </div>
            <p className={cn("mt-0.5 text-xs leading-4 text-slate-500 max-sm:hidden", compactMode && "hidden")}>
              コメントは手動スクロールです。最新へ移動したいときだけ追従ボタンを押します。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <IconButton label="表示テーマ設定へ移動" onClick={onOpenThemeSettings}>
              <Palette className="h-4 w-4" />
            </IconButton>
            <IconButton label={searchOpen ? "検索を閉じる" : "コメントを検索"} active={showSearch} onClick={() => setSearchOpen(!searchOpen)}>
              {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </IconButton>
            <IconButton label={compactMode ? "通常表示に戻す" : "コンパクト表示"} active={compactMode} onClick={() => setCompactMode(!compactMode)}>
              <Rows3 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className={cn("mt-3 grid gap-2", compactMode && "mt-2")}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="コメント表示フィルター">
              {viewOptions.map((option) => {
                const active = commentView === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCommentView(option.value)}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
                      active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                    )}
                  >
                    <span>{option.label}</span>
                    <span className={active ? "text-slate-200" : "text-slate-500"}>{viewCounts[option.value]}</span>
                  </button>
                );
              })}
            </div>
            <Button size="sm" variant="primary" icon={<ArrowDownToLine className="h-3.5 w-3.5" />} onClick={onJumpToLatest}>
              最新へ追従
            </Button>
          </div>
          {showSearch ? (
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <Search className="h-4 w-4 text-slate-400" aria-hidden />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="投稿者名、本文、種別で検索"
                aria-label="コメントを検索"
                autoFocus
                className="w-full bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="検索語を消去"
                  onClick={() => setSearch("")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </label>
          ) : null}
        </div>
      </div>

      <div className="relative">
        {activeMessage ? (
          <div className="sticky top-0 z-10 border-b border-sky-200 bg-sky-50/95 px-3 py-2 backdrop-blur">
            <div className="flex items-start gap-2">
              <Badge tone="blue" className="shrink-0 border-0 bg-sky-100">
                表示中
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-800">{activeMessage.authorName}</div>
                <div className="line-clamp-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-950">{activeMessage.messageText}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton label="表示中コメントをコピー" onClick={() => onCopyMessage(activeMessage)}>
                  <Copy className="h-4 w-4" />
                </IconButton>
                <IconButton label="OBS表示を非表示" onClick={onHideActiveMessage} disabled={busyAction === "hide"}>
                  <EyeOff className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          </div>
        ) : null}

        <div
          ref={listRef}
          data-testid="message-list"
          onScroll={onListScroll}
          className={cn(
            "min-h-[34rem] max-h-[calc(100vh-17rem)] overflow-auto bg-white",
            compactMode && "min-h-[30rem] max-h-[calc(100vh-12rem)]",
            "max-sm:min-h-[28rem] max-sm:max-h-[calc(100vh-11rem)]"
          )}
        >
          <div className={cn("px-2 py-3", compactMode && "px-1.5 py-2", "max-sm:px-1.5 max-sm:py-2")}>
            {orderedMessages.length ? (
              orderedMessages.map((message) => {
                const active = message.id === activeMessageId;
                const isLatest = message.id === latestMessageId;
                const important = isImportantMessage(message);
                const paidEventLabel = formatPaidEventLabel(message);
                const paidEvent = isPaidEvent(message);
                const deleted = Boolean(message.deletionStatus);
                const deletedLabel = deletionLabel(message);
                const rowClassName = deleted
                  ? "border-slate-300 bg-slate-100 text-slate-500"
                  : paidEvent
                  ? active
                    ? "border-sky-600 bg-sky-50 ring-1 ring-amber-300"
                    : "border-amber-400 bg-amber-50/90 hover:bg-amber-100/70"
                  : active
                    ? "border-sky-600 bg-sky-50"
                    : "border-transparent hover:bg-slate-50";
                return (
                  <article
                    key={message.id}
                    className={cn(
                      "group grid grid-cols-[38px_minmax(0,1fr)] gap-2.5 rounded-lg border-l-4 px-2.5 py-2.5 text-left transition",
                      compactMode && "grid-cols-[32px_minmax(0,1fr)] gap-2 px-2 py-2",
                      "max-sm:grid-cols-[32px_minmax(0,1fr)] max-sm:gap-2 max-sm:px-2 max-sm:py-2",
                      rowClassName
                    )}
                    style={messageRowStyle}
                  >
                    {message.authorImageUrl ? (
                      <img
                        src={message.authorImageUrl}
                        alt=""
                        width={36}
                        height={36}
                        className={cn("mt-0.5 h-9 w-9 rounded-full object-cover", compactMode && "h-8 w-8", "max-sm:h-8 max-sm:w-8")}
                      />
                    ) : (
                      <div
                        className={cn(
                          "mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white",
                          compactMode && "h-8 w-8",
                          "max-sm:h-8 max-sm:w-8"
                        )}
                      >
                        {message.messageType === "textMessageEvent" || message.messageType === "testMessage" ? (
                          <Play className="h-4 w-4 fill-white" />
                        ) : (
                          authorInitials(message.authorName)
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!deleted) onShowMessage(message);
                        }}
                        disabled={deleted}
                        className={cn(
                          "block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2",
                          deleted ? "cursor-not-allowed" : "cursor-pointer"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                          <span className={cn("truncate text-sm font-semibold text-slate-900", deleted && "text-slate-500")}>{message.authorName}</span>
                          <span className="shrink-0">{formatChatTime(message.publishedAt)}</span>
                          <span className="truncate">{formatMessageMeta(message)}</span>
                          {important ? <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="重要" /> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {deletedLabel ? (
                            <Badge tone="slate" className="border-0 bg-slate-200 text-slate-700">
                              {deletedLabel}
                            </Badge>
                          ) : null}
                          {active ? (
                            <Badge tone="blue" className="border-0 bg-sky-100">
                              表示中
                            </Badge>
                          ) : null}
                          {message.displayedAt ? (
                            <Badge tone="blue" className="border-0 bg-sky-100">
                              表示済み
                            </Badge>
                          ) : null}
                          {isLatest ? (
                            <Badge tone="slate" className="border-0 bg-slate-950 text-white">
                              最新
                            </Badge>
                          ) : null}
                          {paidEvent ? (
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold text-white", deleted ? "bg-slate-400" : "bg-amber-500")}>
                              {message.amountText ?? paidEventLabel}
                            </span>
                          ) : null}
                        </div>
                        <p
                          className={cn(
                            "mt-1 whitespace-pre-wrap text-[15px] leading-6 text-slate-950",
                            deleted && "text-slate-500",
                            compactMode && "text-sm leading-5",
                            "max-sm:text-sm max-sm:leading-5"
                          )}
                          style={compactMode ? compactMessagePreviewStyle : messagePreviewStyle}
                        >
                          {message.messageText}
                        </p>
                        {!paidEvent && message.amountText ? <div className="mt-1 text-xs font-medium text-amber-700">{message.amountText}</div> : null}
                      </button>
                      <div className="mt-2 flex flex-wrap gap-1.5 opacity-100 transition sm:opacity-70 sm:group-hover:opacity-100">
                        <IconButton label="コメントをOBSに表示" onClick={() => onShowMessage(message)} disabled={deleted || busyAction === `show-${message.id}`}>
                          <Play className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="コメントをコピー" onClick={() => onCopyMessage(message)}>
                          <Copy className="h-4 w-4" />
                        </IconButton>
                        {important ? (
                          <IconButton label="重要コメント" active onClick={() => setCommentView("important")}>
                            <Star className="h-4 w-4 fill-current" />
                          </IconButton>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="px-3 py-8 text-center text-sm text-slate-500">条件に一致するコメントはありません。</div>
            )}
          </div>
        </div>

        {newMessageCount > 0 ? (
          <button
            type="button"
            onClick={onJumpToLatest}
            className="absolute bottom-4 right-4 z-20 inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-slate-950 px-3 text-xs font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            {`新着 ${newMessageCount}件`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
