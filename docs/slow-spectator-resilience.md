# Slow spectator resilience test notes

Slow spectator behavior is covered by the drawing transport tests instead of manual browser throttling.

Use `packages/server/test/DrawingBroadcastCoordinator.test.ts` to reason about backlogged spectators. The test namespace exposes sockets with a writable transport flag. A non-writable spectator queues only the newest live `extendStroke` event, then receives that newest extension before the next reliable action. Reliable drawing actions such as `endStroke` are still emitted in order.

The metrics emitted by the coordinator include `drawing.extend.coalesced` and `drawing.extend.coalesced_flushed`. Each record includes the target, revision, serialized event bytes, total coalesced count, and `mergedLiveUpdateCount`, which is the number of stale live updates replaced by the latest live extension.

Client-side drawing metrics include event bytes, event-to-paint timing, render timing, drawing ack bytes, drawer extend ack latency, and `drawing.resync_count.<target>.<reason>` summaries for snapshot recovery requests.
