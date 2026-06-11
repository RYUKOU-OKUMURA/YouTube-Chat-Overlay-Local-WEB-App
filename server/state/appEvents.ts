import { EventEmitter } from "node:events";
import type {
  AppState,
  BroadcastStatus,
  ChatMessage,
  OverlayState,
  Settings,
  YouTubeStatus
} from "@/types";

export type AppEvents = {
  "state:sync": [AppState];
  "comment:new": [ChatMessage];
  "comment:update": [ChatMessage];
  "youtube:status": [YouTubeStatus];
  "broadcast:status": [BroadcastStatus];
  "overlay:show": [OverlayState];
  "overlay:hide": [OverlayState];
  "overlay:test": [OverlayState];
  "overlay:theme:update": [Settings];
  "overlay:connected": [{ connected: boolean; connectedAt?: string }];
};

export class TypedEmitter extends EventEmitter {
  emit<K extends keyof AppEvents>(eventName: K, ...args: AppEvents[K]): boolean {
    return super.emit(eventName, ...args);
  }

  on<K extends keyof AppEvents>(eventName: K, listener: (...args: AppEvents[K]) => void): this {
    return super.on(eventName, listener);
  }
}
