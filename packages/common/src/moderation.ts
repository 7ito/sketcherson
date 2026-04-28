const BASIC_PROFANITY_BLOCKLIST = ['fuck', 'shit', 'bitch', 'cunt', 'fag', 'nigger'] as const;

export function containsProfanity(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BASIC_PROFANITY_BLOCKLIST.some((word) => normalized.includes(word));
}

export function censorProfanity(value: string): string {
  let result = value;
  for (const word of BASIC_PROFANITY_BLOCKLIST) {
    const pattern = new RegExp(word, 'gi');
    result = result.replace(pattern, '*'.repeat(word.length));
  }
  return result;
}
