export const DEFAULT_EMOTE_ITEMS = [
  { id: 'laugh', emoji: '😂', label: 'Laugh' },
  { id: 'thumbs-up', emoji: '👍', label: 'Thumbs up' },
  { id: 'cry', emoji: '😢', label: 'Cry' },
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
}

export function isValidEmoteItemConfig(item: EmoteItemConfig): boolean {
  const hasEmoji = Boolean(item.emoji);
  const hasImageUrl = Boolean(item.imageUrl);

  return Boolean(item.id && item.label) && hasEmoji !== hasImageUrl;
}

export function resolveEmoteConfig(config: EmoteConfig | undefined): ResolvedEmoteConfig {
  const enabled = config?.enabled ?? false;
  const configuredItems = config?.items ?? [];
  const items = enabled && configuredItems.length === 0 ? DEFAULT_EMOTE_ITEMS : configuredItems;

  return {
    enabled,
    items: enabled ? items.map((item) => ({ ...item })) : [],
  };
}

export function areEmoteItemsValid(items: readonly EmoteItemConfig[]): boolean {
  const itemIds = new Set<string>();

  return items.every((item) => {
    if (itemIds.has(item.id) || !isValidEmoteItemConfig(item)) {
      return false;
    }

    itemIds.add(item.id);
    return true;
  });
}
