import type { ApiResult } from '@7ito/sketcherson-common/room';

export type RateLimitScope = 'chat' | 'drawing' | 'join';

interface RateLimitPolicy {
  maxAttempts: number;
  windowMs: number;
  message: string;
}

interface RateLimitWindow {
  startedAt: number;
  count: number;
}

const RATE_LIMIT_POLICIES: Record<RateLimitScope, RateLimitPolicy> = {
  join: {
    maxAttempts: 5,
    windowMs: 30_000,
    message: 'Too many join attempts. Wait a moment and try again.',
  },
  chat: {
    maxAttempts: 8,
    windowMs: 5_000,
    message: 'Too many messages. Slow down for a moment.',
  },
  drawing: {
    maxAttempts: 480,
    windowMs: 4_000,
    message: 'Too many drawing updates. Slow down for a moment.',
  },
};

export class RateLimiter {
  private readonly windows = new Map<string, RateLimitWindow>();
  private readonly now: () => number;

  public constructor(options: { now: () => number }) {
    this.now = options.now;
  }

  public clearAll(): void {
    this.windows.clear();
  }

  public clearActor(actorKey: string): void {
    for (const scope of Object.keys(RATE_LIMIT_POLICIES) as RateLimitScope[]) {
      this.windows.delete(this.toBucketKey(scope, actorKey));
    }
  }

  public consume(scope: RateLimitScope, actorKey: string): ApiResult<never> | null {
    const policy = RATE_LIMIT_POLICIES[scope];
    const now = this.now();
    const bucketKey = this.toBucketKey(scope, actorKey);
    const existingWindow = this.windows.get(bucketKey);

    if (!existingWindow || now - existingWindow.startedAt >= policy.windowMs) {
      this.windows.set(bucketKey, {
        startedAt: now,
        count: 1,
      });
      return null;
    }

    if (existingWindow.count >= policy.maxAttempts) {
      return {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: policy.message,
        },
      };
    }

    existingWindow.count += 1;
    return null;
  }

  private toBucketKey(scope: RateLimitScope, actorKey: string): string {
    return `${scope}:${actorKey}`;
  }
}
