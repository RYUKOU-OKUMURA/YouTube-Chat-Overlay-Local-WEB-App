"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import type { AppState, OverlayState, Settings, ChatMessage, Theme } from "@/types";
import { socketEvents } from "@/types";

type OverlayEventName =
  | "sync"
  | "show"
  | "pin"
  | "hide"
  | "unpin"
  | "test"
  | "theme";

type ServerToClientEvents = {
  [socketEvents.stateSync]: (state: AppState) => void;
  [socketEvents.overlayState]: (state: OverlayState) => void;
  [socketEvents.overlayShow]: (state: OverlayState) => void;
  [socketEvents.overlayHide]: (state: OverlayState) => void;
  [socketEvents.overlayPin]: (state: OverlayState) => void;
  [socketEvents.overlayUnpin]: (state: OverlayState) => void;
  [socketEvents.overlayTest]: (state: OverlayState) => void;
  [socketEvents.overlayThemeUpdate]: (settings: Settings) => void;
};

type ClientToServerEvents = {
  [socketEvents.overlaySubscribe]: (payload: { overlayToken: string }) => void;
  [socketEvents.requestSync]: () => void;
};

type OverlayClientProps = {
  overlayToken: string;
};

function messageKey(message: ChatMessage) {
  return `${message.id}:${message.displayedAt ?? message.publishedAt}`;
}

function cardPlacement(position: Theme["cardPosition"], padding: number) {
  const shared = { position: "absolute" as const, inset: "auto" as const };

  switch (position) {
    case "top-left":
      return { ...shared, top: padding, left: padding };
    case "top-center":
      return { ...shared, top: padding, left: "50%", transform: "translateX(-50%)" };
    case "top-right":
      return { ...shared, top: padding, right: padding };
    case "bottom-left":
      return { ...shared, bottom: padding, left: padding };
    case "bottom-center":
      return { ...shared, bottom: padding, left: "50%", transform: "translateX(-50%)" };
    case "bottom-right":
      return { ...shared, bottom: padding, right: padding };
    default:
      return { ...shared, bottom: padding, left: "50%", transform: "translateX(-50%)" };
  }
}

function useViewportSize() {
  const [size, setSize] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    const update = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return size;
}

function OverlayBadge({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: accent ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.09)",
        color: "inherit"
      }}
    >
      {children}
    </span>
  );
}

function cardVisualStyle(theme: Theme): CSSProperties {
  const base: CSSProperties = {
    backgroundColor: theme.backgroundColor,
    boxShadow: "0 20px 45px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)"
  };

  switch (theme.stylePreset) {
    case "clinic-calm":
      return {
        ...base,
        border: "1px solid rgba(20, 184, 166, 0.34)",
        backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(204,251,241,0.88))",
        boxShadow: `0 22px 42px rgba(15, 23, 42, 0.18), 0 0 32px rgba(20, 184, 166, 0.32), inset 0 0 26px rgba(255,255,255,0.68)`
      };
    case "warm-pop":
      return {
        ...base,
        border: "2px solid rgba(251, 113, 133, 0.38)",
        backgroundImage: "radial-gradient(circle at 14% 20%, rgba(251, 113, 133, 0.2), transparent 32%)",
        boxShadow: "0 18px 38px rgba(154, 52, 18, 0.24)"
      };
    case "minimal-broadcast":
      return {
        ...base,
        border: "1px solid rgba(245, 158, 11, 0.42)",
        backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 8px), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(0,0,0,0.94))",
        boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 14px 38px rgba(0,0,0,0.44), 0 0 28px rgba(245,158,11,0.22)`
      };
    case "festival-neon":
      return {
        ...base,
        border: `1px solid ${theme.accentColor}`,
        backgroundImage: "linear-gradient(135deg, rgba(244, 114, 182, 0.14), rgba(56, 189, 248, 0.1))",
        boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 0 26px ${theme.accentColor}, 0 20px 48px rgba(0, 0, 0, 0.34)`
      };
    case "comic-pop":
      return {
        ...base,
        border: `5px solid ${theme.accentColor}`,
        backgroundImage: "radial-gradient(circle at 88% 26%, rgba(37, 99, 235, 0.18) 0 2px, transparent 2px 9px)",
        boxShadow: `10px 10px 0 rgba(37, 99, 235, 0.34), 0 0 0 3px rgba(15,23,42,0.95), 0 20px 36px rgba(15, 23, 42, 0.22)`
      };
    default:
      return base;
  }
}

function OverlayCard({
  message,
  theme,
  isPinned,
  isCompact,
  eventName,
}: {
  message: ChatMessage;
  theme: Theme;
  isPinned: boolean;
  isCompact: boolean;
  eventName: OverlayEventName;
}) {
  const cardKey = messageKey(message);
  const maxCardWidth = Math.min(theme.cardWidth, isCompact ? 760 : theme.stylePreset === "minimal-broadcast" ? 1180 : 920);
  const animationType = theme.animationType;
  const visualStyle = cardVisualStyle(theme);
  const isClinic = theme.stylePreset === "clinic-calm";
  const isMinimal = theme.stylePreset === "minimal-broadcast";
  const isComic = theme.stylePreset === "comic-pop";
  const initials = message.authorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  const variants = {
    hidden: {
      opacity: 0,
      y: animationType === "fade" ? 0 : animationType === "scale" ? 10 : 26,
      scale: animationType === "scale" ? 0.96 : 1
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1
    },
    exit: {
      opacity: 0,
      y: animationType === "fade" ? 0 : animationType === "scale" ? 8 : 18,
      scale: animationType === "scale" ? 0.98 : 1
    }
  };

  return (
    <motion.section
      key={cardKey}
      role="presentation"
      aria-hidden
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={variants}
      transition={{
        type: animationType === "fade" ? "tween" : "spring",
        duration: animationType === "fade" ? 0.22 : 0.42,
        bounce: 0.16,
        damping: 24,
        stiffness: 180
      }}
      className="pointer-events-none relative overflow-visible"
      style={{
        width: isMinimal ? "min(100vw - 80px, 1180px)" : "min(100vw - 48px, 920px)",
        maxWidth: maxCardWidth,
        minWidth: 0,
        color: theme.textColor,
        fontSize: theme.fontSize,
        fontFamily: `${theme.fontFamily}, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`,
        borderRadius: theme.borderRadius,
        ...visualStyle
      }}
    >
      {isClinic ? (
        <>
          <div
            className="absolute bottom-0 left-0 top-0 w-20"
            style={{
              background: `linear-gradient(180deg, ${theme.accentColor}, #0f766e)`,
              borderRadius: `${theme.borderRadius}px 0 0 ${theme.borderRadius}px`
            }}
          >
            <div className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/18 text-3xl font-black text-white">
              +
            </div>
            <div
              className="absolute -bottom-5 left-0 h-10 w-20"
              style={{
                background: "linear-gradient(135deg, transparent 50%, rgba(13,148,136,0.92) 51%), linear-gradient(225deg, transparent 50%, rgba(20,184,166,0.92) 51%)"
              }}
            />
          </div>
          <div className="absolute right-8 top-9 h-8 w-32 opacity-80">
            <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2" style={{ background: theme.accentColor }} />
            <div className="absolute left-10 top-1/2 h-6 w-6 -translate-y-1/2 rotate-45 border-r-2 border-t-2" style={{ borderColor: theme.accentColor }} />
            <div className="absolute left-20 top-1/2 h-8 w-4 -translate-y-1/2 border-l-2 border-r-2" style={{ borderColor: theme.accentColor }} />
          </div>
        </>
      ) : null}
      {isMinimal ? (
        <>
          <div className="absolute left-0 top-0 h-9 w-52 origin-top-left -skew-x-12" style={{ background: theme.accentColor }} />
          <div className="absolute bottom-0 right-10 h-full w-14 skew-x-[-24deg]" style={{ background: `linear-gradient(90deg, transparent, ${theme.accentColor})` }} />
          <div className="absolute bottom-0 left-8 top-12 w-1.5 rounded-full" style={{ background: theme.accentColor, boxShadow: `0 0 16px ${theme.accentColor}` }} />
          <div className="absolute right-8 top-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/85">LIVE COMMENT</div>
        </>
      ) : null}
      {theme.stylePreset === "festival-neon" ? (
        <div
          className="absolute -right-3 -top-3 h-8 w-8 rounded-full"
          style={{ background: theme.accentColor, boxShadow: `0 0 22px ${theme.accentColor}` }}
        />
      ) : null}
      {theme.stylePreset === "warm-pop" ? (
        <div className="absolute right-8 top-7 flex gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: theme.accentColor }} />
          <span className="h-3 w-3 rounded-full bg-amber-300" />
          <span className="h-3 w-3 rounded-full bg-sky-300" />
        </div>
      ) : null}
      {isComic ? (
        <div className="absolute -right-7 top-4 flex rotate-12 gap-2">
          <span className="h-10 w-3 -rotate-12 rounded-full bg-slate-950" />
          <span className="h-8 w-3 rotate-12 rounded-full bg-slate-950" />
        </div>
      ) : null}
      <div
        className={isMinimal ? "flex items-center gap-4 px-12 pb-5 pt-11" : isClinic ? "flex items-start gap-4 py-6 pl-28 pr-8" : "flex items-start gap-4 px-6 py-5"}
        style={{
          maxHeight: "calc(100vh - 72px)"
        }}
      >
        {theme.showAvatar ? (
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden"
            style={{
              borderRadius: isComic ? 999 : Math.max(10, Math.min(theme.borderRadius - 4, 20)),
              background: isClinic ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.08)",
              border: isComic ? `4px solid ${theme.accentColor}` : isClinic ? `3px solid rgba(20,184,166,0.32)` : "1px solid rgba(255,255,255,0.10)",
              boxShadow: isClinic ? "0 8px 18px rgba(15, 118, 110, 0.18)" : undefined
            }}
          >
            {message.authorImageUrl ? (
              <img
                src={message.authorImageUrl}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-xl font-semibold">{initials || "?"}</span>
            )}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {theme.showAuthorName ? (
              <h2 className={isMinimal ? "min-w-0 text-[0.72em] font-black leading-tight" : "min-w-0 text-[1.05em] font-semibold leading-tight"}>
                <span
                  className={isMinimal ? "inline-flex max-w-full -skew-x-12 truncate px-4 py-1 text-slate-950" : "block truncate"}
                  style={{
                    background: isMinimal ? theme.accentColor : undefined,
                    color: isComic ? theme.accentColor : undefined,
                    borderRadius: isMinimal ? 2 : undefined
                  }}
                >
                  {message.authorName}
                </span>
              </h2>
            ) : null}

            {message.isOwner ? <OverlayBadge accent>配信者</OverlayBadge> : null}
            {message.isModerator ? <OverlayBadge>モデレーター</OverlayBadge> : null}
            {message.isMember ? <OverlayBadge>メンバー</OverlayBadge> : null}
            {message.isSuperChat ? <OverlayBadge accent>{message.amountText ?? "Super Chat"}</OverlayBadge> : null}
            {isPinned ? <OverlayBadge accent>固定中</OverlayBadge> : null}
            {message.messageType === "testMessage" ? <OverlayBadge accent>テスト</OverlayBadge> : null}
            {eventName === "show" ? <OverlayBadge>表示中</OverlayBadge> : null}
            {eventName === "pin" ? <OverlayBadge accent>固定</OverlayBadge> : null}
            {eventName === "test" ? <OverlayBadge accent>テスト表示</OverlayBadge> : null}
          </div>

          <p
            className={`${isMinimal ? "mt-3 pl-8 text-[1.05em] font-black leading-[1.38]" : isComic ? "mt-4 text-[1.05em] font-black leading-[1.42]" : "mt-3 text-[1em] leading-[1.5]"} whitespace-pre-wrap text-left`}
            style={{
              overflowWrap: "anywhere",
              wordBreak: "normal",
              hyphens: "auto"
            }}
          >
            {message.messageText}
          </p>
        </div>
      </div>
      {isComic ? (
        <div
          className="absolute -bottom-9 left-[55%] h-16 w-16 rotate-45"
          style={{
            background: theme.backgroundColor,
            borderBottom: `5px solid ${theme.accentColor}`,
            borderRight: `5px solid ${theme.accentColor}`,
            boxShadow: "5px 5px 0 rgba(37,99,235,0.3)"
          }}
        />
      ) : null}
    </motion.section>
  );
}

export function OverlayClient({ overlayToken }: OverlayClientProps) {
  const viewport = useViewportSize();
  const isCompact = viewport.width < 1600 || viewport.height < 900;
  const [overlayState, setOverlayState] = useState<OverlayState | null>(null);
  const [eventName, setEventName] = useState<OverlayEventName>("sync");
  const [hiddenMessageKey, setHiddenMessageKey] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootBackground = root.style.background;
    const previousBodyBackground = body.style.background;

    root.classList.add("obs-transparent");
    body.classList.add("obs-transparent");
    root.style.background = "transparent";
    body.style.background = "transparent";

    return () => {
      root.classList.remove("obs-transparent");
      body.classList.remove("obs-transparent");
      root.style.background = previousRootBackground;
      body.style.background = previousBodyBackground;
    };
  }, []);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      path: "/socket.io",
      autoConnect: false,
      transports: ["websocket", "polling"]
    });

    const subscribe = () => {
      socket.emit(socketEvents.overlaySubscribe, { overlayToken });
    };

    const applyOverlayState = (nextState: OverlayState, nextEvent: OverlayEventName) => {
      setOverlayState(nextState);
      setEventName(nextEvent);
    };

    socket.on("connect", subscribe);
    socket.on(socketEvents.stateSync, (state) => {
      setOverlayState(state.overlay);
      setEventName("sync");
    });
    socket.on(socketEvents.overlayState, (state) => applyOverlayState(state, "sync"));
    socket.on(socketEvents.overlayShow, (state) => applyOverlayState(state, "show"));
    socket.on(socketEvents.overlayPin, (state) => applyOverlayState(state, "pin"));
    socket.on(socketEvents.overlayHide, (state) => {
      setOverlayState(state);
      setEventName("hide");
      setHiddenMessageKey(null);
    });
    socket.on(socketEvents.overlayUnpin, (state) => applyOverlayState(state, "unpin"));
    socket.on(socketEvents.overlayTest, (state) => applyOverlayState(state, "test"));
    socket.on(socketEvents.overlayThemeUpdate, (settings) => {
      setOverlayState((current) =>
        current
          ? {
              ...current,
              displayDurationSec: settings.displayDurationSec,
              theme: settings.theme
            }
          : current
      );
      setEventName("theme");
    });
    socket.on("disconnect", () => {
      setEventName("sync");
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [overlayToken]);

  const currentMessage = overlayState?.currentMessage ?? null;
  const currentKey = currentMessage ? messageKey(currentMessage) : null;
  const displayDurationSec = overlayState?.displayDurationSec;
  const visibleMessage = currentMessage && currentKey !== hiddenMessageKey ? currentMessage : null;
  const placement = useMemo(
    () => cardPlacement(overlayState?.theme.cardPosition ?? "bottom-center", isCompact ? 24 : 40),
    [isCompact, overlayState?.theme.cardPosition]
  );

  useEffect(() => {
    if (!currentMessage) {
      setHiddenMessageKey(null);
      return;
    }

    setHiddenMessageKey((previous) => (previous === currentKey ? previous : null));
  }, [currentKey, currentMessage]);

  useEffect(() => {
    if (!currentMessage || !currentKey || overlayState?.isPinned || displayDurationSec == null) {
      return;
    }

    const displayedAt = new Date(currentMessage.displayedAt ?? currentMessage.publishedAt).getTime();
    const remaining = displayedAt + displayDurationSec * 1000 - Date.now();

    if (remaining <= 0) {
      setHiddenMessageKey(currentKey);
      return;
    }

    const timer = window.setTimeout(() => {
      setHiddenMessageKey(currentKey);
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [
    currentKey,
    currentMessage,
    displayDurationSec,
    overlayState?.isPinned
  ]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-transparent">
      <div className="relative h-full w-full">
        <div className="pointer-events-none" style={placement}>
          <AnimatePresence initial={false} mode="wait">
            {visibleMessage && overlayState ? (
              <OverlayCard
                key={currentKey ?? visibleMessage.id}
                message={visibleMessage}
                theme={overlayState.theme}
                isPinned={overlayState.isPinned}
                isCompact={isCompact}
                eventName={eventName}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
