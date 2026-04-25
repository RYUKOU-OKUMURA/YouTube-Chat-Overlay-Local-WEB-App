"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  const maxCardWidth = Math.min(theme.cardWidth, isCompact ? 680 : 920);
  const animationType = theme.animationType;
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
      className="pointer-events-none"
      style={{
        width: "min(100vw - 48px, 920px)",
        maxWidth: maxCardWidth,
        minWidth: 0,
        color: theme.textColor,
        fontSize: theme.fontSize,
        fontFamily: `${theme.fontFamily}, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`,
        borderRadius: theme.borderRadius,
        backgroundColor: theme.backgroundColor,
        boxShadow: `0 20px 45px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(255, 255, 255, 0.08)`,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)"
      }}
    >
      <div
        className="flex items-start gap-4 px-6 py-5"
        style={{
          maxHeight: "calc(100vh - 72px)"
        }}
      >
        {theme.showAvatar ? (
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden"
            style={{
              borderRadius: Math.max(10, Math.min(theme.borderRadius - 4, 20)),
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.10)"
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
              <h2 className="min-w-0 text-[1.05em] font-semibold leading-tight">
                <span className="block truncate">{message.authorName}</span>
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
            className="mt-3 whitespace-pre-wrap text-[1em] leading-[1.5] text-left"
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
