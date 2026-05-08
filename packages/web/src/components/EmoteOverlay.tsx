import { useState } from 'react';
import type { EmoteEvent } from '@7ito/sketcherson-common/room';
import type { ResolvedEmoteItem } from '@7ito/sketcherson-common';

export function EmoteOverlay({ events, items }: { events: EmoteEvent[]; items: readonly ResolvedEmoteItem[] }) {
  const itemsById = new Map(items.map((item) => [item.id, item]));

  return (
    <div className="emote-overlay" aria-hidden="true">
      {events.map((event) => {
        const item = itemsById.get(event.emoteId);
        if (!item) return null;

        return (
          <span
            key={event.eventId}
            className="emote-bubble"
            style={{ left: `${event.x * 100}%`, top: `${event.y * 100}%` }}
          >
            {item.emoji ? item.emoji : <img src={item.imageUrl} alt="" />}
          </span>
        );
      })}
    </div>
  );
}

export function EmoteDock({ items, onSend }: { items: readonly ResolvedEmoteItem[]; onSend: (emoteId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={isOpen ? 'emote-dock emote-dock-open' : 'emote-dock'}>
      <button
        type="button"
        className="emote-tab"
        aria-label="Toggle emotes"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        ☺
      </button>
      <div className="emote-options">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="emote-option"
            onClick={() => {
              onSend(item.id);
              setIsOpen(false);
            }}
            aria-label={item.label}
          >
            {item.emoji ? item.emoji : <img src={item.imageUrl} alt="" />}
          </button>
        ))}
      </div>
    </div>
  );
}
