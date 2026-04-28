import { useMemo, type RefObject, type CSSProperties } from "react";
import { Copy, Play, Search, ArrowDownToLine } from "lucide-react";
import type { ChatMessage } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";

export type CommentView = "all" | "undisplayed" | "important";

function formatMessageMeta(message: ChatMessage) {
  const tags = [
    message.isOwner ? "配信者" : null,
    message.isModerator ? "モデレーター" : null,
    message.isMember ? "メンバー" : null,
    message.isSuperChat ? "Super Chat" : null
  ].filter(Boolean);
  if (tags.length) return tags.join(" · ");
  if (message.messageType === "testMessage") return "テストコメント";
  if (message.messageType === "textMessageEvent") return "通常コメント";
  return message.messageType;
}

function authorInitials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "YT";
}

function formatChatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const messagePreviewStyle: CSSProperties = {
  display: "-webkit-box",
  overflow: "hidden",
  overflowWrap: "anywhere",
  wordBreak: "normal",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 4
};

const messageRowStyle: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "96px"
};

export function MessagePanel({
  messages,
  activeMessageId,
  latestMessageId,
  search,
  setSearch,
  commentView,
  setCommentView,
  autoscroll,
  setAutoscroll,
  onShowMessage,
  onCopyMessage,
  busyAction,
  listRef,
  filteredCount,
  undisplayedCount,
  viewCounts
}: {
  messages: ChatMessage[];
  activeMessageId: string | null;
  latestMessageId: string | null;
  search: string;
  setSearch: (value: string) => void;
  commentView: CommentView;
  setCommentView: (value: CommentView) => void;
  autoscroll: boolean;
  setAutoscroll: (value: boolean) => void;
  onShowMessage: (message: ChatMessage) => void;
  onCopyMessage: (message: ChatMessage) => void;
  busyAction: string | null;
  listRef: RefObject<HTMLDivElement | null>;
  filteredCount: number;
  undisplayedCount: number;
  viewCounts: Record<CommentView, number>;
}) {
  const orderedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const viewOptions: Array<{ value: CommentView; label: string }> = [
    { value: "all", label: "すべて" },
    { value: "undisplayed", label: "未表示" },
    { value: "important", label: "重要" }
  ];

  return (
    <Panel
      title="ライブチャット操作"
      subtitle="YouTubeライブチャットに近い流れで、古いコメントから新しいコメントへ下に流れます。"
      className="overflow-hidden rounded-2xl"
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="slate">{`現在 ${filteredCount}件`}</Badge>
          <Badge tone={undisplayedCount > 0 ? "amber" : "slate"}>{`未表示 ${undisplayedCount}件`}</Badge>
          <Button
            size="sm"
            variant={autoscroll ? "primary" : "ghost"}
            icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
            onClick={() => setAutoscroll(!autoscroll)}
            aria-pressed={autoscroll}
          >
            最新へ追従
          </Button>
        </div>
      }
    >
      <div className="-m-4 grid">
        <label className="flex h-12 items-center gap-2 border-b border-slate-200 bg-white px-4">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="投稿者名、本文、種別で検索"
            aria-label="コメントを検索"
            className="w-full bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2" role="tablist" aria-label="コメント表示フィルター">
          {viewOptions.map((option) => {
            const active = commentView === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCommentView(option.value)}
                className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span>{option.label}</span>
                <span className={active ? "text-slate-200" : "text-slate-500"}>{viewCounts[option.value]}</span>
              </button>
            );
          })}
        </div>
        <div ref={listRef} className="min-h-[34rem] max-h-[calc(100vh-17rem)] overflow-auto bg-white">
          <div className="px-2 py-3">
            {orderedMessages.length ? (
              orderedMessages.map((message) => {
                const active = message.id === activeMessageId;
                const isLatest = message.id === latestMessageId;
                const rowClassName = message.isSuperChat
                  ? active
                    ? "border-red-600 bg-red-50/80 ring-1 ring-amber-300"
                    : "border-amber-400 bg-amber-50/90 hover:bg-amber-100/70"
                  : active
                    ? "border-red-600 bg-red-50/70"
                    : "border-transparent hover:bg-slate-50";
                return (
                  <article
                    key={message.id}
                    className={`group grid grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-xl border-l-4 px-3 py-3 text-left transition ${rowClassName}`}
                    style={messageRowStyle}
                  >
                    {message.authorImageUrl ? (
                      <img src={message.authorImageUrl} alt="" width={36} height={36} className="mt-0.5 h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
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
                        onClick={() => onShowMessage(message)}
                        className="block w-full cursor-pointer rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="max-w-[16rem] truncate text-sm font-semibold text-slate-900">{message.authorName}</span>
                          <span className="text-[11px] text-slate-500">{formatChatTime(message.publishedAt)}</span>
                          <span className="text-[11px] text-slate-500">{formatMessageMeta(message)}</span>
                          {active ? <Badge tone="amber" className="border-0 bg-amber-100">表示中</Badge> : null}
                          {message.displayedAt ? <Badge tone="blue" className="border-0 bg-sky-100">表示済み</Badge> : null}
                          {isLatest ? <Badge tone="slate" className="border-0 bg-slate-950 text-white">最新</Badge> : null}
                        </div>
                        {message.isSuperChat ? (
                          <div className="mt-2 inline-flex rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white shadow-sm shadow-amber-200">
                            {message.amountText ?? "Super Chat"}
                          </div>
                        ) : null}
                        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-slate-900" style={messagePreviewStyle}>
                          {message.messageText}
                        </p>
                        {!message.isSuperChat && message.amountText ? <div className="mt-1 text-xs font-medium text-amber-700">{message.amountText}</div> : null}
                      </button>
                      <div className="mt-2 flex flex-wrap gap-2 opacity-100 transition lg:opacity-70 lg:group-hover:opacity-100">
                        <Button
                          size="sm"
                          icon={<Play className="h-3.5 w-3.5" />}
                          onClick={() => onShowMessage(message)}
                          disabled={busyAction === `show-${message.id}`}
                        >
                          表示
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => onCopyMessage(message)}>
                          コピー
                        </Button>
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
      </div>
    </Panel>
  );
}
