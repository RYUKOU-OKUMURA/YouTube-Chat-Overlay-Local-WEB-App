import { useMemo, type RefObject, type CSSProperties } from "react";
import { Copy, Play, Search, ArrowDownToLine } from "lucide-react";
import type { ChatMessage } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";

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

export function MessagePanel({
  messages,
  activeMessageId,
  search,
  setSearch,
  autoscroll,
  setAutoscroll,
  onShowMessage,
  onCopyMessage,
  listRef,
  filteredCount
}: {
  messages: ChatMessage[];
  activeMessageId: string | null;
  search: string;
  setSearch: (value: string) => void;
  autoscroll: boolean;
  setAutoscroll: (value: boolean) => void;
  onShowMessage: (message: ChatMessage) => void;
  onCopyMessage: (message: ChatMessage) => void;
  listRef: RefObject<HTMLDivElement | null>;
  filteredCount: number;
}) {
  const orderedMessages = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <Panel
      title="ライブチャット操作"
      subtitle="YouTubeライブチャットに近い流れで、古いコメントから新しいコメントへ下に流れます。"
      className="overflow-hidden rounded-2xl"
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="slate">{String(filteredCount)}件</Badge>
          <Button size="sm" variant={autoscroll ? "primary" : "ghost"} icon={<ArrowDownToLine className="h-3.5 w-3.5" />} onClick={() => setAutoscroll(!autoscroll)}>
            最新へ追従
          </Button>
        </div>
      }
    >
      <div className="-m-4 grid">
        <label className="flex h-12 items-center gap-2 border-b border-slate-200 bg-white px-4">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="投稿者名、本文、種別で検索"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        <div ref={listRef} className="min-h-[34rem] max-h-[calc(100vh-17rem)] overflow-auto bg-white">
          <div className="px-2 py-3">
            {orderedMessages.length ? (
              orderedMessages.map((message, index) => {
                const active = message.id === activeMessageId;
                const isLatest = index === orderedMessages.length - 1;
                return (
                  <article
                    key={message.id}
                    className={`group grid cursor-pointer grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-xl border-l-4 px-3 py-3 transition ${
                      active ? "border-red-600 bg-red-50/70" : "border-transparent hover:bg-slate-50"
                    }`}
                    onClick={() => onShowMessage(message)}
                  >
                    {message.authorImageUrl ? (
                      <img src={message.authorImageUrl} alt="" className="mt-0.5 h-9 w-9 rounded-full object-cover" />
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
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="max-w-[16rem] truncate text-sm font-semibold text-slate-900">{message.authorName}</span>
                        <span className="text-[11px] text-slate-500">{formatChatTime(message.publishedAt)}</span>
                        <span className="text-[11px] text-slate-500">{formatMessageMeta(message)}</span>
                        {active ? <Badge tone="amber" className="border-0 bg-amber-100">表示中</Badge> : null}
                        {message.displayedAt ? <Badge tone="blue" className="border-0 bg-sky-100">表示済み</Badge> : null}
                        {isLatest ? <Badge tone="slate" className="border-0 bg-slate-950 text-white">最新</Badge> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-slate-900" style={messagePreviewStyle}>
                        {message.messageText}
                      </p>
                      {message.amountText ? <div className="mt-1 text-xs font-medium text-amber-700">{message.amountText}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-2 opacity-100 transition lg:opacity-70 lg:group-hover:opacity-100">
                        <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={(event) => { event.stopPropagation(); onCopyMessage(message); }}>
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
