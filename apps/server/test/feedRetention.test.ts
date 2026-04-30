import { describe, expect, it } from 'vitest';
import { appendRoomFeedRecord, ROOM_FEED_MAX_RECORDS, type RoomFeedRecord } from '../src/domain/roomRuntime/model';

describe('room feed retention', () => {
  it('caps retained feed records to the newest records', () => {
    const feed: RoomFeedRecord[] = [];

    for (let index = 0; index < ROOM_FEED_MAX_RECORDS + 5; index += 1) {
      appendRoomFeedRecord(feed, {
        id: `feed-${index}`,
        type: 'system',
        event: { type: 'gamePaused' },
        createdAt: index,
        turnNumber: null,
      });
    }

    expect(feed).toHaveLength(ROOM_FEED_MAX_RECORDS);
    expect(feed[0]?.id).toBe('feed-5');
    expect(feed.at(-1)?.id).toBe(`feed-${ROOM_FEED_MAX_RECORDS + 4}`);
  });
});
