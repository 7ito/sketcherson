export interface PromptCollection {
  id: string;
  name: string;
  description?: string;
  enabledByDefault?: boolean;
}

export interface PromptEntry {
  id: string;
  name: string;
  aliases: string[];
  enabled: boolean;
  artFileName?: string | null;
  collectionIds: string[];
}

export interface PromptCatalog<TEntry extends PromptEntry = PromptEntry> {
  collections: PromptCollection[];
  entries: TEntry[];
}

export function getDefaultEnabledCollectionIds(catalog: PromptCatalog): string[] {
  return catalog.collections.filter((collection) => collection.enabledByDefault !== false).map((collection) => collection.id);
}

export function normalizeEnabledCollectionIds(catalog: PromptCatalog, collectionIds?: readonly string[] | null): string[] {
  const requestedIds = collectionIds ? collectionIds : getDefaultEnabledCollectionIds(catalog);
  const requestedIdSet = new Set(requestedIds);

  return catalog.collections.filter((collection) => requestedIdSet.has(collection.id)).map((collection) => collection.id);
}

export function areEnabledCollectionIdsValid(catalog: PromptCatalog, collectionIds?: readonly string[] | null): boolean {
  const normalizedIds = normalizeEnabledCollectionIds(catalog, collectionIds);

  if (normalizedIds.length === 0) {
    return false;
  }

  const validCollectionIdSet = new Set(catalog.collections.map((collection) => collection.id));
  const uniqueRequestedIds = new Set(collectionIds ? collectionIds : getDefaultEnabledCollectionIds(catalog));

  if (uniqueRequestedIds.size !== normalizedIds.length) {
    return false;
  }

  return Array.from(uniqueRequestedIds).every((collectionId) => validCollectionIdSet.has(collectionId));
}

export function getEnabledPromptEntries<TEntry extends PromptEntry>(catalog: PromptCatalog<TEntry>, collectionIds?: readonly string[] | null): TEntry[] {
  const enabledCollectionIds = new Set(normalizeEnabledCollectionIds(catalog, collectionIds));

  return catalog.entries.filter(
    (entry) => entry.enabled && entry.collectionIds.some((collectionId) => enabledCollectionIds.has(collectionId)),
  );
}

export function getPromptEntryById<TEntry extends PromptEntry>(catalog: PromptCatalog<TEntry>, entryId: string): TEntry | null {
  return catalog.entries.find((entry) => entry.enabled && entry.id === entryId) ?? null;
}

export function getPromptEntryByName<TEntry extends PromptEntry>(catalog: PromptCatalog<TEntry>, entryName: string): TEntry | null {
  return catalog.entries.find((entry) => entry.enabled && entry.name === entryName) ?? null;
}

export function pickRandomPromptEntry<TEntry extends PromptEntry>(
  catalog: PromptCatalog<TEntry>,
  random: () => number = Math.random,
  options?: {
    excludedIds?: Set<string> | string;
    collectionIds?: readonly string[] | null;
  },
): TEntry | null {
  const enabledEntries = getEnabledPromptEntries(catalog, options?.collectionIds);

  if (enabledEntries.length === 0) {
    return null;
  }

  const excludedIds =
    options?.excludedIds instanceof Set ? options.excludedIds : options?.excludedIds ? new Set([options.excludedIds]) : new Set<string>();
  const availableEntries = enabledEntries.filter((entry) => !excludedIds.has(entry.id));
  const entryPool = availableEntries.length > 0 ? availableEntries : enabledEntries;
  const index = Math.min(entryPool.length - 1, Math.floor(random() * entryPool.length));

  return entryPool[index] ?? null;
}
