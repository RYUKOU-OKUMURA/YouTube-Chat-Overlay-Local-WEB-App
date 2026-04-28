import { Palette, Check, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import type { Settings, Theme } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Field } from "@/components/common/Field";
import { Panel } from "@/components/common/Panel";
import { overlayStylePresets } from "@/lib/themePresets";

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

const controlClassName =
  "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

function presetCardStyle(preset: (typeof overlayStylePresets)[number], active: boolean): CSSProperties {
  const accent = preset.theme.accentColor ?? "#38bdf8";
  const ink = preset.theme.textColor ?? "#0f172a";

  if (preset.id === "clinic-calm") {
    return {
      background: "linear-gradient(135deg, rgba(236,253,250,0.98), rgba(255,255,255,0.92))",
      borderColor: active ? accent : "rgba(20,184,166,0.36)",
      color: "#0f172a",
      boxShadow: active ? `0 0 0 2px ${accent}, 0 16px 30px rgba(20,184,166,0.18)` : "0 10px 24px rgba(20,184,166,0.1)"
    };
  }

  if (preset.id === "minimal-broadcast") {
    return {
      background: "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 8px), linear-gradient(180deg, #111827, #020617)",
      borderColor: active ? accent : "rgba(245,158,11,0.42)",
      color: "#f8fafc",
      boxShadow: active ? `0 0 0 2px ${accent}, 0 16px 32px rgba(245,158,11,0.18)` : "0 10px 24px rgba(2,6,23,0.18)"
    };
  }

  if (preset.id === "comic-pop") {
    return {
      background: "radial-gradient(circle at 88% 28%, rgba(37,99,235,0.18) 0 2px, transparent 2px 9px), #ffffff",
      borderColor: active ? accent : "rgba(37,99,235,0.52)",
      color: "#111827",
      boxShadow: active ? `6px 6px 0 rgba(37,99,235,0.28), 0 0 0 2px ${accent}` : "6px 6px 0 rgba(37,99,235,0.16)"
    };
  }

  return {
    background: active ? "#020617" : "#ffffff",
    borderColor: active ? "#020617" : "#e2e8f0",
    color: active ? "#ffffff" : ink
  };
}

type SettingsPatch = {
  theme?: Partial<Theme>;
  lastBroadcastUrl?: string;
};

export function SettingsPanel({
  settings,
  onPatchSettings
}: {
  settings: Pick<Settings, "theme">;
  onPatchSettings: (patch: SettingsPatch) => void | Promise<void>;
}) {
  const { theme } = settings;

  return (
    <Panel title="表示・テーマ設定" subtitle="配信中でも読みやすい表示へ調整できます。">
      <div className="grid gap-4">
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Sparkles className="h-4 w-4 text-slate-500" />
            <span>スタイルプリセット</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {overlayStylePresets.map((preset) => {
              const active = theme.stylePreset === preset.id;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onPatchSettings({ theme: preset.theme })}
                  className="relative grid min-h-[128px] content-between overflow-hidden rounded-xl border p-3 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                  style={presetCardStyle(preset, active)}
                >
                  {preset.id === "clinic-calm" ? (
                    <>
                      <span className="absolute bottom-0 left-0 top-0 w-8" style={{ background: `linear-gradient(180deg, ${preset.theme.accentColor}, #0f766e)` }} />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xl font-black text-white">+</span>
                      <span className="absolute right-5 top-5 h-0.5 w-20" style={{ background: preset.theme.accentColor }} />
                    </>
                  ) : null}
                  {preset.id === "minimal-broadcast" ? (
                    <>
                      <span className="absolute left-0 top-0 h-7 w-36 -skew-x-12" style={{ background: preset.theme.accentColor }} />
                      <span className="absolute right-5 top-4 text-[10px] font-black tracking-[0.18em] text-white/70">LIVE</span>
                      <span className="absolute bottom-0 right-8 h-full w-10 skew-x-[-24deg]" style={{ background: `linear-gradient(90deg, transparent, ${preset.theme.accentColor})` }} />
                    </>
                  ) : null}
                  <div>
                    <div className={`flex items-center justify-between gap-2 ${preset.id === "clinic-calm" ? "pl-10" : ""}`}>
                      <span className="text-sm font-bold">{preset.name}</span>
                      {active ? <Check className="h-4 w-4" /> : null}
                    </div>
                    <p className={`mt-1 text-xs leading-5 ${preset.id === "clinic-calm" ? "pl-10" : ""} ${preset.id === "minimal-broadcast" ? "text-white/72" : active && !["clinic-calm", "comic-pop"].includes(preset.id) ? "text-slate-200" : "text-slate-500"}`}>{preset.mood}</p>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <span className="h-5 w-5 rounded-full border border-white/40" style={{ background: preset.theme.backgroundColor }} />
                    <span className="h-5 w-5 rounded-full border border-white/40" style={{ background: preset.theme.textColor }} />
                    <span className="h-5 w-5 rounded-full border border-white/40" style={{ background: preset.theme.accentColor }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="フォント">
            <select
              value={theme.fontFamily}
              onChange={(event) => onPatchSettings({ theme: { fontFamily: event.target.value } })}
              className={controlClassName}
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
              className={controlClassName}
            />
          </Field>
          <Field label="文字サイズの自動調整">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <input
                type="checkbox"
                checked={Boolean(theme.autoFitText)}
                onChange={(event) => onPatchSettings({ theme: { autoFitText: event.target.checked } })}
              />
              <span className="text-sm">長い本文をカード内に収める</span>
            </div>
          </Field>
          <Field label="カード幅">
            <input
              type="number"
              min={360}
              max={1200}
              value={theme.cardWidth}
              onChange={(event) => onPatchSettings({ theme: { cardWidth: Number(event.target.value) } })}
              className={controlClassName}
            />
          </Field>
          <Field label="角丸">
            <input
              type="number"
              min={0}
              max={48}
              value={theme.borderRadius}
              onChange={(event) => onPatchSettings({ theme: { borderRadius: Number(event.target.value) } })}
              className={controlClassName}
            />
          </Field>
          <Field label="表示位置">
            <select
              value={theme.cardPosition}
              onChange={(event) => onPatchSettings({ theme: { cardPosition: event.target.value as Theme["cardPosition"] } })}
              className={controlClassName}
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
              className={controlClassName}
            />
          </Field>
          <Field label="文字色">
            <input
              value={theme.textColor}
              onChange={(event) => onPatchSettings({ theme: { textColor: event.target.value } })}
              className={controlClassName}
            />
          </Field>
          <Field label="アクセント色">
            <input
              value={theme.accentColor}
              onChange={(event) => onPatchSettings({ theme: { accentColor: event.target.value } })}
              className={controlClassName}
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="アニメーション">
            <select
              value={theme.animationType}
              onChange={(event) => onPatchSettings({ theme: { animationType: event.target.value as Theme["animationType"] } })}
              className={controlClassName}
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
