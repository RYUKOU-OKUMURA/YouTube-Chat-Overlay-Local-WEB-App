"use client";

import { BadgeJapaneseYen, Copy, Play } from "lucide-react";
import type { ChatMessage } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";

function formatChatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatPaidEventLabel(message: ChatMessage) {
  return message.messageType === "superStickerEvent" ? "Super Sticker" : "Super Chat";
}

export function SuperChatPanel({
  superChats,
  activeMessageId,
  onShowMessage,
  onCopyMessage,
  busyAction
}: {
  superChats: ChatMessage[];
  activeMessageId: string | null;
  onShowMessage: (message: ChatMessage) => void;
  onCopyMessage: (message: ChatMessage) => void;
  busyAction: string | null;
}) {
  return (
    <Panel
      title="Super Chat / Sticker履歴"
      subtitle="配信中に受け取ったSuper ChatとSuper Stickerを最大100件保持します。"
      className="overflow-hidden rounded-2xl bg-white"
      actions={<Badge tone={superChats.length > 0 ? "amber" : "slate"}>{superChats.length}件</Badge>}
    >
      <div className="-m-4 max-h-80 overflow-auto">
        {superChats.length ? (
          <div className="grid gap-2 p-3">
            {superChats.map((message) => {
              const active = message.id === activeMessageId;
              const paidEventLabel = formatPaidEventLabel(message);
              return (
                <div
                  key={message.id}
                  className={`grid gap-2 rounded-xl border px-3 py-3 ${
                    active ? "border-red-500 bg-red-50" : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <BadgeJapaneseYen className="h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{message.authorName}</div>
                    <div className="shrink-0 text-[11px] text-slate-500">{formatChatTime(message.publishedAt)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white">{message.amountText ?? paidEventLabel}</span>
                    <Badge tone="amber" className="border-0 bg-amber-100">{paidEventLabel}</Badge>
                    {active ? <Badge tone="amber" className="border-0 bg-amber-100">表示中</Badge> : null}
                    {message.displayedAt ? <Badge tone="blue" className="border-0 bg-sky-100">表示済み</Badge> : null}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-5 text-slate-900">{message.messageText}</p>
                  <div className="flex flex-wrap gap-2">
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
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">Super Chat / Stickerはまだありません。</div>
        )}
      </div>
    </Panel>
  );
}
