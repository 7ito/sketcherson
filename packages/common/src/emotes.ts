export const DEFAULT_EMOTE_ITEMS = [
  { id: 'laugh', emoji: '😂', label: 'Laugh' },
  { id: 'thumbs-up', emoji: '👍', label: 'Thumbs up' },
  { id: 'cry', emoji: '😭', label: 'Cry' },
  { id: 'angry', emoji: '😡', label: 'Angry' },
] as const;

export interface EmoteItemConfig {
  id: string;
  label: string;
  emoji?: string;
  imageUrl?: string;
}

export interface EmoteConfig {
  enabled?: boolean;
  items?: readonly EmoteItemConfig[];
  maxVisible?: number;
  durationMs?: number;
}

export interface ResolvedEmoteItem {
  id: string;
  label: string;
  emoji?: string;
  imageUrl?: string;
}

export interface ResolvedEmoteConfig {
  enabled: boolean;
  items: readonly ResolvedEmoteItem[];
  maxVisible: number;
  durationMs: number;
}

export function isValidEmoteItemConfig(item: EmoteItemConfig): boolean {
  const hasEmoji = Boolean(item.emoji);
  const hasImageUrl = Boolean(item.imageUrl);

  return Boolean(item.id.trim() && item.label.trim()) && hasEmoji !== hasImageUrl;
}

export function resolveEmoteConfig(config: EmoteConfig | undefined): ResolvedEmoteConfig {
  const enabled = config?.enabled ?? false;
  const configuredItems = config?.items ?? [];

  if (configuredItems.length > 0 && !areEmoteItemsValid(configuredItems)) {
    throw new Error('Emote items must have unique IDs, labels, and exactly one visual source.');
  }

  const items = enabled && configuredItems.length === 0 ? DEFAULT_EMOTE_ITEMS : configuredItems;

  return {
    enabled,
    items: enabled ? items.map((item) => ({ ...item })) : [],
    maxVisible: normalizePositiveInteger(config?.maxVisible, 12),
    durationMs: normalizePositiveInteger(config?.durationMs, 1_800),
  };
}

export function areEmoteItemsValid(items: readonly EmoteItemConfig[]): boolean {
  const itemIds = new Set<string>();

  return items.every((item) => {
    const itemId = item.id.trim();

    if (itemIds.has(itemId) || !isValidEmoteItemConfig(item)) {
      return false;
    }

    itemIds.add(itemId);
    return true;
  });
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}
