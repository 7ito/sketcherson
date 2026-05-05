# @7ito/sketcherson-web

## 0.3.12

### Patch Changes

- Fix quick successive drawing strokes on production latency.
- Updated dependencies
  - @7ito/sketcherson-common@0.3.11

## 0.3.11

### Patch Changes

- Drawing canvas fixes
- Updated dependencies
  - @7ito/sketcherson-common@0.3.10

## 0.3.10

### Patch Changes

- Fix quick successive strokes disappearing after delayed drawing acknowledgements.
- Updated dependencies
  - @7ito/sketcherson-common@0.3.9

## 0.3.9

### Patch Changes

- Postgame summary fix
- Updated dependencies
  - @7ito/sketcherson-common@0.3.8

## 0.3.8

### Patch Changes

- Postgame lobby fixes
- Updated dependencies
  - @7ito/sketcherson-common@0.3.7

## 0.3.7

### Patch Changes

- Keep postgame galleries grouped by server round metadata for late join drawings.
- Updated dependencies
  - @7ito/sketcherson-common@0.3.6

## 0.3.6

### Patch Changes

- remote dev update
- Updated dependencies
  - @7ito/sketcherson-common@0.3.5

## 0.3.5

### Patch Changes

- build script fix
- Updated dependencies
  - @7ito/sketcherson-common@0.3.4

## 0.3.4

### Patch Changes

- Resolve Socket.IO backend URL at runtime instead of baking localhost into the published web bundle.

## 0.3.3

### Patch Changes

- Fuzzy guess checking update
- Updated dependencies
  - @7ito/sketcherson-common@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies
  - @7ito/sketcherson-common@0.3.2

## 0.3.1

### Patch Changes

- Drawing system performance refactor
- Updated dependencies
  - @7ito/sketcherson-common@0.3.1

## 0.3.0

### Minor Changes

- Improve realtime drawing resilience with separated drawing traffic, coalesced live stroke updates for slower spectators, authoritative stroke completion, drawing snapshot recovery, and slimmer room/control payloads.

### Patch Changes

- Updated dependencies
  - @7ito/sketcherson-common@0.3.0

## 0.2.5

### Patch Changes

- Patch drawing canvas horizontal area #2
- Updated dependencies
  - @7ito/sketcherson-common@0.2.5

## 0.2.4

### Patch Changes

- Patch canvas drawing space
- Updated dependencies
  - @7ito/sketcherson-common@0.2.4

## 0.2.3

### Patch Changes

- Publish aligned package versions for downstream updates.
- Updated dependencies
  - @7ito/sketcherson-common@0.2.3

## 0.2.2

### Patch Changes

- Remove justify-content: center from canvas viewport so the canvas frame stretches to fill horizontal space.

## 0.2.1

### Patch Changes

- 2f5a59b: Remove 4:3 aspect ratio constraint from drawing canvas so it fills the available horizontal space.

## 0.2.0

### Minor Changes

- 7e40524: Add a typed `lobbySettingsPanel` extension slot for downstream lobby settings UI.

### Patch Changes

- Settings extension
- Updated dependencies
  - @7ito/sketcherson-common@0.1.4

## 0.1.3

### Patch Changes

- CI test cleanup and lobby refresh dropping fixed
- Updated dependencies
  - @7ito/sketcherson-common@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies
  - @7ito/sketcherson-common@0.1.2

## 0.1.0

### Minor Changes

- b0887f8: Add typed web extension slots for home page addons and prompt reference panels.

### Patch Changes

- Stabilize close guess metadata, feed audiences, fuzzy guess helper exports, and close guess setting labels for downstream games.
- Updated dependencies
- Updated dependencies [eada9ac]
  - @7ito/sketcherson-common@0.1.0
