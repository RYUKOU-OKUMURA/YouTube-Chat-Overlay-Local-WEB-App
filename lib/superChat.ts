export type SuperChatTier = {
  id: "blue" | "gold" | "purple" | "red";
  minAmount: number;
  maxAmount: number | null;
  label: string;
  colors: {
    panel: string;
    header: string;
    accent: string;
    accentSoft: string;
    text: string;
    muted: string;
    glow: string;
    border: string;
    pointer: string;
  };
};

export const superChatTiers: SuperChatTier[] = [
  {
    id: "blue",
    minAmount: 1,
    maxAmount: 999,
    label: "1-999",
    colors: {
      panel: "linear-gradient(135deg, rgba(8, 47, 73, 0.96), rgba(6, 78, 122, 0.95))",
      header: "linear-gradient(135deg, #38bdf8, #22d3ee)",
      accent: "#67e8f9",
      accentSoft: "rgba(103, 232, 249, 0.2)",
      text: "#ecfeff",
      muted: "rgba(236, 254, 255, 0.76)",
      glow: "rgba(34, 211, 238, 0.46)",
      border: "rgba(125, 211, 252, 0.62)",
      pointer: "#064e7a"
    }
  },
  {
    id: "gold",
    minAmount: 1000,
    maxAmount: 4999,
    label: "1000-4999",
    colors: {
      panel: "linear-gradient(135deg, rgba(120, 53, 15, 0.96), rgba(146, 64, 14, 0.95))",
      header: "linear-gradient(135deg, #facc15, #f59e0b)",
      accent: "#fde68a",
      accentSoft: "rgba(253, 230, 138, 0.22)",
      text: "#fffbeb",
      muted: "rgba(255, 251, 235, 0.78)",
      glow: "rgba(245, 158, 11, 0.5)",
      border: "rgba(251, 191, 36, 0.68)",
      pointer: "#92400e"
    }
  },
  {
    id: "purple",
    minAmount: 5000,
    maxAmount: 9999,
    label: "5000-9999",
    colors: {
      panel: "linear-gradient(135deg, rgba(59, 7, 100, 0.96), rgba(91, 33, 182, 0.95))",
      header: "linear-gradient(135deg, #facc15, #a78bfa)",
      accent: "#fef3c7",
      accentSoft: "rgba(250, 204, 21, 0.22)",
      text: "#faf5ff",
      muted: "rgba(250, 245, 255, 0.78)",
      glow: "rgba(168, 85, 247, 0.5)",
      border: "rgba(250, 204, 21, 0.62)",
      pointer: "#5b21b6"
    }
  },
  {
    id: "red",
    minAmount: 10000,
    maxAmount: null,
    label: "10000+",
    colors: {
      panel: "linear-gradient(135deg, rgba(127, 29, 29, 0.97), rgba(153, 27, 27, 0.96))",
      header: "linear-gradient(135deg, #fbbf24, #ef4444)",
      accent: "#fde68a",
      accentSoft: "rgba(251, 191, 36, 0.24)",
      text: "#fff7ed",
      muted: "rgba(255, 247, 237, 0.8)",
      glow: "rgba(239, 68, 68, 0.56)",
      border: "rgba(251, 191, 36, 0.74)",
      pointer: "#991b1b"
    }
  }
];

export const fallbackSuperChatTier = superChatTiers[1];

export function parseYenAmount(amountText?: string) {
  if (!amountText) return null;

  const normalized = amountText
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[,\s，]/g, "");
  const match = normalized.match(/^(?:JPY|¥|￥)(\d+)$/i);

  return match ? Number.parseInt(match[1], 10) : null;
}

export function getSuperChatTier(amountText?: string) {
  const amount = parseYenAmount(amountText);

  if (!amount) return fallbackSuperChatTier;

  return (
    superChatTiers.find((tier) => amount >= tier.minAmount && (tier.maxAmount === null || amount <= tier.maxAmount)) ??
    fallbackSuperChatTier
  );
}
