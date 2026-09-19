import type { CSSProperties } from "react";
import type { ChatMessage } from "@/types";

type ChatMessageContentProps = {
  message: Pick<ChatMessage, "messageText" | "content">;
  className?: string;
  emojiStyle?: CSSProperties;
};

const defaultEmojiStyle: CSSProperties = {
  display: "inline-block",
  height: "1.16em",
  width: "auto",
  maxWidth: "1.72em",
  marginInline: "0.055em",
  verticalAlign: "-0.2em",
  objectFit: "contain"
};

/** Renders only structured text and trusted https image URLs; never chat HTML. */
export function ChatMessageContent({ message, className, emojiStyle }: ChatMessageContentProps) {
  if (!message.content?.length) {
    return <>{message.messageText}</>;
  }

  return (
    <span className={className}>
      {message.content.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={`text-${index}`}>{segment.text}</span>
        ) : (
          <img
            key={`emoji-${index}-${segment.imageUrl}`}
            src={segment.imageUrl}
            alt={segment.alt}
            title={segment.shortcode ?? segment.alt}
            draggable={false}
            referrerPolicy="no-referrer"
            style={{ ...defaultEmojiStyle, ...emojiStyle }}
          />
        )
      )}
    </span>
  );
}

/** Avoid making a long :shortcode: shrink the whole OBS message in auto-fit mode. */
export function chatMessageDisplayText(message: Pick<ChatMessage, "messageText" | "content">) {
  if (!message.content?.length) return message.messageText;
  return message.content.map((segment) => (segment.kind === "text" ? segment.text : "◉")).join("");
}
