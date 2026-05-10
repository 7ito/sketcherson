import { useEffect, useMemo, useState } from 'react';
import type { EmoteEvent } from '@7ito/sketcherson-common/room';
import type { ResolvedEmoteItem } from '@7ito/sketcherson-common';

export type RenderableEmoteEvent = EmoteEvent & { receivedAt?: number };

const DEFAULT_EMOTE_DURATION_MS = 1_800;
const DEFAULT_MAX_VISIBLE_EMOTES = 12;

export function EmoteOverlay({
  events,
  items,
  durationMs = DEFAULT_EMOTE_DURATION_MS,
  maxVisible = DEFAULT_MAX_VISIBLE_EMOTES,
}: {
  events: RenderableEmoteEvent[];
  items: readonly ResolvedEmoteItem[];
  durationMs?: number;
  maxVisible?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const visibleEvents = events
    .filter((event) => now - (event.receivedAt ?? event.createdAt) <= durationMs)
    .slice(-maxVisible);

  useEffect(() => {
    if (events.length === 0) {
      return undefined;
    }

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), Math.min(durationMs, 250));
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setNow(Date.now());
    }, durationMs + 50);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [durationMs, events]);

  return (
    <div className="emote-overlay" aria-hidden="true">
      {visibleEvents.map((event) => {
        const item = itemsById.get(event.emoteId);
        if (!item) return null;

        return (
          <span
            key={event.eventId}
            className="emote-bubble"
            style={{
              left: `${event.x * 100}%`,
              bottom: '0%',
              animationDuration: `${durationMs}ms`,
            }}
          >
            {item.emoji ? item.emoji : <img src={item.imageUrl} alt="" />}
          </span>
        );
      })}
    </div>
  );
}

export function EmoteDock({ items, onSend }: { items: readonly ResolvedEmoteItem[]; onSend: (emoteId: string) => Promise<void> | void }) {
  return (
    <div className="emote-dock">
      <span className="emote-tab" aria-hidden="true">☺</span>
      <div className="emote-options">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="emote-option"
            onClick={() => void onSend(item.id)}
            aria-label={item.label}
          >
            {item.emoji ? item.emoji : <img src={item.imageUrl} alt="" />}
          </button>
        ))}
      </div>
    </div>
  );
}
