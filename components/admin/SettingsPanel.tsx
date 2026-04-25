import { Palette, Clock3, Check } from "lucide-react";
import type { Settings, Theme } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Field } from "@/components/common/Field";
import { Panel } from "@/components/common/Panel";

const fontFamilies = [
  "Inter, system-ui, sans-serif",
  "ui-sans-serif, system-ui, sans-serif",
  "Arial, sans-serif",
  "Georgia, serif",
  "'Noto Sans JP', sans-serif"
];

const positions: Theme["cardPosition"][] = [
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "top-left",
  "top-center",
  "top-right"
];

const positionLabels: Record<Theme["cardPosition"], string> = {
  "bottom-left": "左下",
  "bottom-center": "下中央",
  "bottom-right": "右下",
  "top-left": "左上",
  "top-center": "上中央",
  "top-right": "右上"
};

const animationLabels: Record<Theme["animationType"], string> = {
  fade: "フェード",
  "slide-up": "下からスライド",
  scale: "拡大"
};

type SettingsPatch = {
  displayDurationSec?: number;
  theme?: Partial<Theme>;
  lastBroadcastUrl?: string;
};

export function SettingsPanel({
  settings,
  onPatchSettings
}: {
  settings: Pick<Settings, "displayDurationSec" | "theme">;
  onPatchSettings: (patch: SettingsPatch) => void | Promise<void>;
}) {
  const { theme } = settings;

  return (
    <Panel title="表示・テーマ設定" subtitle="配信中でも読みやすい表示へ調整できます。">
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="表示秒数" hint="固定表示でないコメントが自動で消えるまでの秒数です。">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <Clock3 className="h-4 w-4 text-slate-400" />
              <input
                type="number"
                min={3}
                max={60}
                value={settings.displayDurationSec}
                onChange={(event) => onPatchSettings({ displayDurationSec: Number(event.target.value) })}
                className="w-full bg-transparent text-sm outline-none"
              />
              <span className="text-xs text-slate-500">秒</span>
            </label>
          </Field>
          <Field label="フォント">
            <select
              value={theme.fontFamily}
              onChange={(event) => onPatchSettings({ theme: { fontFamily: event.target.value } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            >
              {fontFamilies.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </Field>
          <Field label="文字サイズ">
            <input
              type="number"
              min={16}
              max={64}
              value={theme.fontSize}
              onChange={(event) => onPatchSettings({ theme: { fontSize: Number(event.target.value) } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            />
          </Field>
          <Field label="カード幅">
            <input
              type="number"
              min={360}
              max={1200}
              value={theme.cardWidth}
              onChange={(event) => onPatchSettings({ theme: { cardWidth: Number(event.target.value) } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            />
          </Field>
          <Field label="角丸">
            <input
              type="number"
              min={0}
              max={48}
              value={theme.borderRadius}
              onChange={(event) => onPatchSettings({ theme: { borderRadius: Number(event.target.value) } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            />
          </Field>
          <Field label="表示位置">
            <select
              value={theme.cardPosition}
              onChange={(event) => onPatchSettings({ theme: { cardPosition: event.target.value as Theme["cardPosition"] } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            >
              {positions.map((position) => (
                <option key={position} value={position}>
                  {positionLabels[position]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="背景色">
            <input
              value={theme.backgroundColor}
              onChange={(event) => onPatchSettings({ theme: { backgroundColor: event.target.value } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            />
          </Field>
          <Field label="文字色">
            <input
              value={theme.textColor}
              onChange={(event) => onPatchSettings({ theme: { textColor: event.target.value } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            />
          </Field>
          <Field label="アクセント色">
            <input
              value={theme.accentColor}
              onChange={(event) => onPatchSettings({ theme: { accentColor: event.target.value } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="アニメーション">
            <select
              value={theme.animationType}
              onChange={(event) => onPatchSettings({ theme: { animationType: event.target.value as Theme["animationType"] } })}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none"
            >
              <option value="fade">フェード</option>
              <option value="slide-up">下からスライド</option>
              <option value="scale">拡大</option>
            </select>
          </Field>
          <Field label="アイコン表示">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <input
                type="checkbox"
                checked={theme.showAvatar}
                onChange={(event) => onPatchSettings({ theme: { showAvatar: event.target.checked } })}
              />
              <span className="text-sm">有効</span>
            </div>
          </Field>
          <Field label="投稿者名表示">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <input
                type="checkbox"
                checked={theme.showAuthorName}
                onChange={(event) => onPatchSettings({ theme: { showAuthorName: event.target.checked } })}
              />
              <span className="text-sm">有効</span>
            </div>
          </Field>
        </div>
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Palette className="h-4 w-4 text-slate-500" />
            <span>プレビューは現在のOBS表示設定に合わせています。</span>
          </div>
          <Badge tone="blue">{animationLabels[theme.animationType]}</Badge>
        </div>
        <div
          className="w-full max-w-xl rounded-xl border px-4 py-3"
          style={{
            background: theme.backgroundColor,
            color: theme.textColor,
            borderRadius: theme.borderRadius,
            width: "100%",
            maxWidth: `${Math.min(theme.cardWidth, 720)}px`,
            fontFamily: theme.fontFamily,
            fontSize: `${Math.min(theme.fontSize, 30)}px`
          }}
        >
          <div className="text-sm font-semibold">サンプル視聴者</div>
          <div className="mt-1 text-sm leading-5 opacity-90">ライブコメントはこのような見た目でOBSに表示されます。</div>
          <div className="mt-2 flex items-center gap-2 text-[11px] opacity-75">
            <Check className="h-3.5 w-3.5" />
            <span>設定はOBSオーバーレイへリアルタイム反映されます。</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
