import type { RefObject } from "react";
import { Check, Copy, Pin, Search, SquareMousePointer, ArrowUpDown } from "lucide-react";
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

export function MessagePanel({
  messages,
  selectedMessageId,
  search,
  setSearch,
  autoscroll,
  setAutoscroll,
  onSelectMessage,
  onShowMessage,
  onPinMessage,
  onCopyMessage,
  listRef,
  filteredCount
}: {
  messages: ChatMessage[];
  selectedMessageId: string | null;
  search: string;
  setSearch: (value: string) => void;
  autoscroll: boolean;
  setAutoscroll: (value: boolean) => void;
  onSelectMessage: (message: ChatMessage) => void;
  onShowMessage: (message: ChatMessage) => void;
  onPinMessage: (message: ChatMessage) => void;
  onCopyMessage: (message: ChatMessage) => void;
  listRef: RefObject<HTMLDivElement | null>;
  filteredCount: number;
}) {
  return (
    <Panel
      title="コメント一覧"
      subtitle="コメントを検索・選択して、OBSオーバーレイへ表示します。"
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="slate">{String(filteredCount)}件表示</Badge>
          <Button size="sm" variant={autoscroll ? "primary" : "ghost"} icon={<ArrowUpDown className="h-3.5 w-3.5" />} onClick={() => setAutoscroll(!autoscroll)}>
            自動追従
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="投稿者名、本文、種別で検索"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        <div ref={listRef} className="max-h-[34rem] overflow-auto rounded-xl border border-slate-200 bg-slate-50">
          <div className="divide-y divide-slate-200">
            {messages.length ? (
              messages.map((message) => {
                const selected = message.id === selectedMessageId;
                return (
                  <article
                    key={message.id}
                    className={`flex gap-3 px-3 py-3 transition ${selected ? "bg-sky-50" : "hover:bg-white"}`}
                    onClick={() => onSelectMessage(message)}
                  >
                    {message.authorImageUrl ? (
                      <img src={message.authorImageUrl} alt="" className="mt-0.5 h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                        {message.authorName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{message.authorName}</div>
                          <div className="text-[11px] text-slate-500">{formatMessageMeta(message)}</div>
                        </div>
                        <Badge tone={selected ? "blue" : "slate"}>{message.displayedAt ? "表示済み" : "新着"}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-700">{message.messageText}</p>
                      {message.amountText ? <div className="mt-1 text-xs font-medium text-amber-700">{message.amountText}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" icon={<SquareMousePointer className="h-3.5 w-3.5" />} onClick={(event) => { event.stopPropagation(); onSelectMessage(message); }}>
                          選択
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Check className="h-3.5 w-3.5" />} onClick={(event) => { event.stopPropagation(); onShowMessage(message); }}>
                          表示
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Pin className="h-3.5 w-3.5" />} onClick={(event) => { event.stopPropagation(); onPinMessage(message); }}>
                          固定
                        </Button>
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
