import { Check, Copy, EyeOff, Play, Radio, Search, Settings } from "lucide-react";
import { overlayStylePresets } from "@/lib/themePresets";
import type { Theme } from "@/types";

const messages = [
  { author: "整体チャンネル", time: "02:15", text: "肩こりのセルフケアは毎日やった方がいいですか？", type: "member" },
  { author: "mika", time: "02:16", text: "いまの説明めちゃくちゃわかりやすいです！", type: "normal" },
  { author: "佐藤", time: "02:17", text: "腰痛の人は寝る前に何を避けたらいいですか？", type: "normal" },
  { author: "あき", time: "02:18", text: "次はストレッチの順番を聞きたいです", type: "latest" }
];

function MessageRow({ message, compact = false }: { message: (typeof messages)[number]; compact?: boolean }) {
  return (
    <div className="group grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-xl px-3 py-2.5 transition hover:bg-zinc-50">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
        <Play className="h-4 w-4 fill-white" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-zinc-900">{message.author}</span>
          <span className="text-xs text-zinc-500">{message.time}</span>
          {message.type === "member" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">メンバー</span> : null}
          {message.type === "latest" ? <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white">最新</span> : null}
        </div>
        <p className="mt-1 break-words text-sm leading-6 text-zinc-900">{message.text}</p>
        {!compact ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white">
              <Check className="h-3.5 w-3.5" />
              表示
            </button>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-500">
              <Copy className="h-3.5 w-3.5" />
              コピー
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SampleChrome({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">{label}</p>
          <h2 className="text-xl font-bold text-zinc-950">{title}</h2>
        </div>
        <div className="flex rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
          <span className="rounded-lg bg-zinc-950 px-3 py-1.5 text-white">操作画面</span>
          <span className="px-3 py-1.5 text-zinc-500">管理・設定</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function previewFrameStyle(theme: Partial<Theme>) {
  const accent = theme.accentColor ?? "#38bdf8";
  const base = {
    background: theme.backgroundColor,
    color: theme.textColor,
    borderRadius: theme.borderRadius,
    fontFamily: theme.fontFamily
  };

  if (theme.stylePreset === "clinic-calm") {
    return {
      ...base,
      border: "1px solid rgba(20, 184, 166, 0.34)",
      backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(204,251,241,0.88))",
      boxShadow: "0 22px 42px rgba(15, 23, 42, 0.18), 0 0 32px rgba(20, 184, 166, 0.32), inset 0 0 26px rgba(255,255,255,0.68)"
    };
  }
  if (theme.stylePreset === "warm-pop") {
    return { ...base, border: "2px solid rgba(251, 113, 133, 0.38)", backgroundImage: "radial-gradient(circle at 14% 20%, rgba(251, 113, 133, 0.2), transparent 32%)", boxShadow: "0 18px 38px rgba(154, 52, 18, 0.18)" };
  }
  if (theme.stylePreset === "minimal-broadcast") {
    return {
      ...base,
      border: "1px solid rgba(245, 158, 11, 0.42)",
      backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 8px), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(0,0,0,0.94))",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 14px 38px rgba(0,0,0,0.44), 0 0 28px rgba(245,158,11,0.22)"
    };
  }
  if (theme.stylePreset === "festival-neon") {
    return { ...base, border: `1px solid ${accent}`, backgroundImage: "linear-gradient(135deg, rgba(244, 114, 182, 0.14), rgba(56, 189, 248, 0.1))", boxShadow: `0 0 24px ${accent}, 0 20px 48px rgba(0, 0, 0, 0.34)` };
  }
  if (theme.stylePreset === "comic-pop") {
    return {
      ...base,
      border: `5px solid ${accent}`,
      backgroundImage: "radial-gradient(circle at 88% 26%, rgba(37, 99, 235, 0.18) 0 2px, transparent 2px 9px)",
      boxShadow: "10px 10px 0 rgba(37, 99, 235, 0.34), 0 0 0 3px rgba(15,23,42,0.95), 0 20px 36px rgba(15, 23, 42, 0.22)"
    };
  }
  return { ...base, boxShadow: "0 20px 45px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(255, 255, 255, 0.08)" };
}

function OverlayStylePreview({ preset }: { preset: (typeof overlayStylePresets)[number] }) {
  const theme = preset.theme;
  const accent = theme.accentColor ?? "#38bdf8";

  return (
    <article className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-zinc-950">{preset.name}</h3>
            <p className="mt-1 text-sm font-semibold text-zinc-500">{preset.mood}</p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: accent }}>
            {theme.animationType}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{preset.description}</p>
      </div>
      <div className="grid min-h-[220px] place-items-center rounded-xl bg-[linear-gradient(135deg,#1f2937,#0f172a)] p-5">
        <div
          className={`relative w-full ${theme.stylePreset === "minimal-broadcast" ? "max-w-[640px] px-7 pb-4 pt-10" : theme.stylePreset === "clinic-calm" ? "max-w-[560px] py-5 pl-24 pr-6" : "max-w-[560px] px-5 py-4"}`}
          style={previewFrameStyle(theme)}
        >
          {theme.stylePreset === "clinic-calm" ? (
            <>
              <span className="absolute bottom-0 left-0 top-0 w-16" style={{ background: `linear-gradient(180deg, ${accent}, #0f766e)`, borderRadius: `${theme.borderRadius}px 0 0 ${theme.borderRadius}px` }} />
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-4xl font-black text-white">+</span>
              <span className="absolute right-8 top-8 h-0.5 w-24" style={{ background: accent }} />
              <span className="absolute right-20 top-5 h-8 w-5 border-l-2 border-r-2" style={{ borderColor: accent }} />
            </>
          ) : null}
          {theme.stylePreset === "minimal-broadcast" ? (
            <>
              <span className="absolute left-0 top-0 h-8 w-44 -skew-x-12" style={{ background: accent }} />
              <span className="absolute bottom-0 left-8 top-12 w-1.5 rounded-full" style={{ background: accent, boxShadow: `0 0 16px ${accent}` }} />
              <span className="absolute right-7 top-3 text-[10px] font-black tracking-[0.18em] text-white/80">LIVE COMMENT</span>
              <span className="absolute bottom-0 right-8 h-full w-12 skew-x-[-24deg]" style={{ background: `linear-gradient(90deg, transparent, ${accent})` }} />
            </>
          ) : null}
          {theme.stylePreset === "festival-neon" ? <span className="absolute -right-3 -top-3 h-8 w-8 rounded-full" style={{ background: accent, boxShadow: `0 0 22px ${accent}` }} /> : null}
          {theme.stylePreset === "warm-pop" ? (
            <div className="absolute right-7 top-7 flex gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: accent }} />
              <span className="h-3 w-3 rounded-full bg-amber-300" />
              <span className="h-3 w-3 rounded-full bg-sky-300" />
            </div>
          ) : null}
          <div className={theme.stylePreset === "minimal-broadcast" ? "flex items-center gap-3" : "flex items-start gap-4"}>
            {theme.showAvatar ? (
              <div
                className="grid h-12 w-12 shrink-0 place-items-center border border-white/20 bg-white/15 text-base font-bold"
                style={{ borderRadius: theme.stylePreset === "comic-pop" ? 999 : 14, borderColor: theme.stylePreset === "comic-pop" ? accent : undefined }}
              >
                PB
              </div>
            ) : null}
            <div className="min-w-0">
              {theme.showAuthorName ? (
                <div
                  className={theme.stylePreset === "minimal-broadcast" ? "inline-flex -skew-x-12 px-3 py-1 text-xs font-black text-slate-950" : "truncate text-sm font-bold"}
                  style={{ background: theme.stylePreset === "minimal-broadcast" ? accent : undefined, color: theme.stylePreset === "comic-pop" ? accent : undefined }}
                >
                  視聴者さん
                </div>
              ) : null}
              <p className={`mt-2 whitespace-pre-wrap font-semibold ${theme.stylePreset === "minimal-broadcast" ? "pl-6 text-[23px] leading-[1.32]" : "text-[22px] leading-[1.45]"}`}>肩こりのセルフケア、配信を見ながら一緒にやっても大丈夫ですか？</p>
              <div className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold" style={{ background: `${accent}22`, color: theme.textColor }}>
                メンバー
              </div>
            </div>
          </div>
          {theme.stylePreset === "comic-pop" ? <span className="absolute -bottom-4 left-12 h-8 w-8 rotate-45" style={{ background: theme.backgroundColor, borderBottom: `3px solid ${accent}`, borderRight: `3px solid ${accent}` }} /> : null}
        </div>
      </div>
      <div className="grid gap-2 text-sm text-zinc-600">
        <div>Font: {theme.fontFamily}</div>
        <div>Position: {theme.cardPosition} / Width: {theme.cardWidth}px</div>
      </div>
    </article>
  );
}

export default function DesignSamplesPage() {
  return (
    <main className="min-h-screen bg-zinc-100 p-8 text-zinc-950">
      <div className="mx-auto grid max-w-7xl gap-8">
        <div>
          <p className="text-sm font-semibold text-red-600">UI改善サンプル</p>
          <h1 className="text-3xl font-bold">YouTubeライブコメント操作画面</h1>
        </div>

        <section className="grid gap-4">
          <div>
            <p className="text-sm font-semibold text-red-600">OBSコメントスタイル</p>
            <h2 className="text-2xl font-bold">気分やテーマで切り替える表示パターン</h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {overlayStylePresets.map((preset) => (
              <OverlayStylePreview key={preset.id} preset={preset} />
            ))}
          </div>
        </section>

        <SampleChrome label="Sample A" title="YouTube Studio寄せ">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="border-r border-zinc-200">
              <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
                <Search className="h-4 w-4 text-zinc-400" />
                <span className="text-sm text-zinc-500">投稿者名、本文で検索</span>
                <span className="ml-auto text-xs font-semibold text-zinc-500">最新へ追従 ON</span>
              </div>
              <div className="p-2">
                {messages.map((message) => (
                  <MessageRow key={message.time} message={message} />
                ))}
              </div>
            </div>
            <aside className="bg-zinc-50 p-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-xs font-semibold text-zinc-500">現在のOBS表示</p>
                <div className="mt-3 rounded-2xl bg-zinc-950 p-4 text-white shadow-lg">
                  <p className="text-sm font-semibold">佐藤</p>
                  <p className="mt-2 text-lg leading-7">腰痛の人は寝る前に何を避けたらいいですか？</p>
                </div>
                <div className="mt-3 grid gap-2">
                  <button className="h-10 rounded-lg border border-zinc-300 text-sm font-bold">隠す</button>
                </div>
              </div>
            </aside>
          </div>
        </SampleChrome>

        <SampleChrome label="Sample B" title="配信卓寄せ">
          <div className="grid gap-4 bg-zinc-950 p-5 text-white lg:grid-cols-[280px_minmax(0,1fr)_320px]">
            <aside className="rounded-2xl bg-zinc-900 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
                <Radio className="h-4 w-4" />
                コメント取得中
              </div>
              <div className="mt-4 grid gap-2 text-sm text-zinc-300">
                <span>Socket 接続済み</span>
                <span>OBS 起動中</span>
                <span>手動で非表示</span>
              </div>
            </aside>
            <div className="rounded-2xl bg-white p-3 text-zinc-950">
              {messages.map((message) => (
                <MessageRow key={message.time} message={message} />
              ))}
            </div>
            <aside className="rounded-2xl bg-zinc-900 p-4">
              <p className="text-xs font-semibold text-zinc-400">クイック操作</p>
              <div className="mt-3 grid gap-2">
                <button className="h-12 rounded-xl bg-red-600 font-bold">表示</button>
                <button className="h-12 rounded-xl bg-zinc-800 font-bold">非表示</button>
              </div>
            </aside>
          </div>
        </SampleChrome>

        <SampleChrome label="Sample C" title="コンパクト司令塔">
          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-zinc-200">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <span className="font-semibold">ライブチャット</span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">LIVE</span>
              </div>
              <div className="p-2">
                {messages.map((message) => (
                  <MessageRow key={message.time} message={message} compact />
                ))}
              </div>
            </div>
            <aside className="grid content-start gap-3">
              <button className="h-14 rounded-2xl bg-zinc-950 text-base font-bold text-white">
                選択コメントを表示
              </button>
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-300 font-bold">
                <EyeOff className="h-4 w-4" />
                非表示
              </button>
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-300 font-bold">
                <Settings className="h-4 w-4" />
                管理・設定へ
              </button>
            </aside>
          </div>
        </SampleChrome>
      </div>
    </main>
  );
}
