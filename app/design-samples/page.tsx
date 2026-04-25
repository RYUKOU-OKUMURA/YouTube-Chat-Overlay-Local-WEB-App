import { Check, Copy, EyeOff, Pin, Play, Radio, Search, Settings } from "lucide-react";

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
            <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800">
              <Pin className="h-3.5 w-3.5" />
              固定
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

export default function DesignSamplesPage() {
  return (
    <main className="min-h-screen bg-zinc-100 p-8 text-zinc-950">
      <div className="mx-auto grid max-w-7xl gap-8">
        <div>
          <p className="text-sm font-semibold text-red-600">UI改善サンプル</p>
          <h1 className="text-3xl font-bold">YouTubeライブコメント操作画面</h1>
        </div>

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
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="h-10 rounded-lg bg-red-600 text-sm font-bold text-white">固定</button>
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
                <span>表示秒数 8秒</span>
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
                <button className="h-12 rounded-xl bg-amber-500 font-bold text-zinc-950">固定</button>
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
              <button className="h-14 rounded-2xl bg-red-600 text-base font-bold text-white">
                固定表示
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
