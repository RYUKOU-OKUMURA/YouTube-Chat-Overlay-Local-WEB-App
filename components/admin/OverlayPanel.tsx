import { Copy, EyeOff, MessageSquareMore } from "lucide-react";
import type { OverlayState } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";

function messageTypeLabel(messageType: string) {
  if (messageType === "testMessage") return "テストコメント";
  if (messageType === "textMessageEvent") return "通常コメント";
  return messageType;
}

export function OverlayPanel({
  overlay,
  onHide,
  onCopyMessage,
  onCopyOverlayUrl
}: {
  overlay: OverlayState;
  onHide: () => void;
  onCopyMessage: () => void;
  onCopyOverlayUrl: () => void;
}) {
  const active = overlay.currentMessage;
  return (
    <Panel
      title="現在のOBS表示"
      subtitle="OBSに出ているコメントを確認します。"
      className="rounded-2xl bg-slate-50"
      actions={<Badge tone={active ? "amber" : "slate"}>{active ? "表示中" : "非表示"}</Badge>}
    >
      <div className="grid gap-3">
        {active ? (
          <div
            className="rounded-2xl border border-slate-200 p-4 shadow-lg"
            style={{
              background: overlay.theme.backgroundColor,
              color: overlay.theme.textColor,
              borderRadius: overlay.theme.borderRadius
            }}
          >
            <div className="flex items-start gap-3">
              {active.authorImageUrl && overlay.theme.showAvatar ? (
                <img src={active.authorImageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                {overlay.theme.showAuthorName ? <div className="truncate text-sm font-semibold">{active.authorName}</div> : null}
                <div className="mt-1 whitespace-pre-wrap text-sm leading-5">{active.messageText}</div>
                <div className="mt-2 text-[11px] opacity-80">
                  {messageTypeLabel(active.messageType)} · {new Date(active.publishedAt).toLocaleTimeString()}{" "}
                  {active.displayedAt ? `· 表示 ${new Date(active.displayedAt).toLocaleTimeString()}` : ""}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
            表示中のコメントはありません。コメントをクリックするとOBSに表示されます。
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" icon={<EyeOff className="h-4 w-4" />} onClick={onHide}>
            非表示
          </Button>
          <Button variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={onCopyMessage} disabled={!active}>
            コメントをコピー
          </Button>
          <Button variant="ghost" className="col-span-2" icon={<MessageSquareMore className="h-4 w-4" />} onClick={onCopyOverlayUrl}>
            OBS URLをコピー
          </Button>
        </div>
        <div className="grid gap-1 text-xs text-slate-600">
          <div>テーマ: {overlay.theme.fontFamily} · {overlay.theme.animationType}</div>
        </div>
      </div>
    </Panel>
  );
}
