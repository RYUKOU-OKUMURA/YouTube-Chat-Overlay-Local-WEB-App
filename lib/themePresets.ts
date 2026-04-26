import type { Theme } from "@/types";

export type OverlayStylePreset = {
  id: Theme["stylePreset"];
  name: string;
  mood: string;
  description: string;
  theme: Partial<Theme>;
};

export const overlayStylePresets: OverlayStylePreset[] = [
  {
    id: "midnight-glass",
    name: "Midnight Glass",
    mood: "落ち着いた雑談・解説",
    description: "半透明の黒ガラス。動画の邪魔をしにくく、医療・整体系の解説にも合わせやすい標準スタイル。",
    theme: {
      stylePreset: "midnight-glass",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 28,
      cardWidth: 760,
      cardPosition: "bottom-center",
      borderRadius: 22,
      showAvatar: true,
      showAuthorName: true,
      backgroundColor: "rgba(17, 24, 39, 0.92)",
      textColor: "#f8fafc",
      accentColor: "#38bdf8",
      animationType: "slide-up"
    }
  },
  {
    id: "clinic-calm",
    name: "Clinic Calm Pro",
    mood: "健康・教育・相談",
    description: "白いフロストカードに医療リボンと心電図ラインを加えた、清潔感と信頼感のある相談配信向けスタイル。",
    theme: {
      stylePreset: "clinic-calm",
      fontFamily: "'Noto Sans JP', system-ui, sans-serif",
      fontSize: 30,
      cardWidth: 820,
      cardPosition: "bottom-center",
      borderRadius: 28,
      showAvatar: true,
      showAuthorName: true,
      backgroundColor: "rgba(236, 253, 250, 0.94)",
      textColor: "#0f172a",
      accentColor: "#14b8a6",
      animationType: "scale"
    }
  },
  {
    id: "warm-pop",
    name: "Warm Pop",
    mood: "親しみやすいライブ",
    description: "明るい白とコーラルの組み合わせ。コメントを楽しく拾うカジュアル配信に。",
    theme: {
      stylePreset: "warm-pop",
      fontFamily: "'Noto Sans JP', system-ui, sans-serif",
      fontSize: 29,
      cardWidth: 780,
      cardPosition: "bottom-left",
      borderRadius: 26,
      showAvatar: true,
      showAuthorName: true,
      backgroundColor: "rgba(255, 247, 237, 0.96)",
      textColor: "#431407",
      accentColor: "#fb7185",
      animationType: "scale"
    }
  },
  {
    id: "minimal-broadcast",
    name: "Minimal Broadcast",
    mood: "ニュース・講義・作業配信",
    description: "採用案。黒いカーボン調のローワーサードにアンバーのアクセントを入れ、情報テロップのように強く見せます。",
    theme: {
      stylePreset: "minimal-broadcast",
      fontFamily: "'Noto Sans JP', ui-sans-serif, system-ui, sans-serif",
      fontSize: 30,
      cardWidth: 1120,
      cardPosition: "bottom-center",
      borderRadius: 4,
      showAvatar: false,
      showAuthorName: true,
      backgroundColor: "rgba(6, 8, 12, 0.94)",
      textColor: "#f8fafc",
      accentColor: "#f59e0b",
      animationType: "slide-up"
    }
  },
  {
    id: "festival-neon",
    name: "Festival Neon",
    mood: "イベント・盛り上げ回",
    description: "黒地にネオンの縁取り。企画回や参加型イベントでコメントを主役にしたい時に。",
    theme: {
      stylePreset: "festival-neon",
      fontFamily: "'Noto Sans JP', system-ui, sans-serif",
      fontSize: 30,
      cardWidth: 820,
      cardPosition: "bottom-right",
      borderRadius: 24,
      showAvatar: true,
      showAuthorName: true,
      backgroundColor: "rgba(12, 10, 9, 0.94)",
      textColor: "#fff7ed",
      accentColor: "#f472b6",
      animationType: "scale"
    }
  },
  {
    id: "comic-pop",
    name: "Comic Pop Voice",
    mood: "Q&A・リアクション強め",
    description: "太いアウトラインの吹き出しに汎用のPICK UP装飾を合わせ、質問以外のコメントにも使えるポップな表示。",
    theme: {
      stylePreset: "comic-pop",
      fontFamily: "'Noto Sans JP', system-ui, sans-serif",
      fontSize: 31,
      cardWidth: 840,
      cardPosition: "bottom-center",
      borderRadius: 24,
      showAvatar: true,
      showAuthorName: true,
      backgroundColor: "rgba(255, 255, 255, 0.98)",
      textColor: "#111827",
      accentColor: "#2563eb",
      animationType: "scale"
    }
  }
];

export function getOverlayStylePreset(id: Theme["stylePreset"]) {
  return overlayStylePresets.find((preset) => preset.id === id) ?? overlayStylePresets[0];
}
