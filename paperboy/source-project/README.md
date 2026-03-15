# Paperboy Neighborhood Prototype

A first playable Phaser 3 neighborhood scene for a Paperboy-style browser game.

## Included

- Scrollable neighborhood with roads, intersections, driveways, lawns, houses, and hedges
- Bike steering with surface-aware handling
- Camera follow
- Newspaper throw mechanic with inherited bike velocity and simple arc/bounce behavior
- Data-driven neighborhood definition for future expansion

## Controls

- Move: Arrow keys or WASD
- Throw: Mouse click or Space

## Project structure

- `src/world/neighborhoods.ts` stores neighborhood definitions
- `src/world/NeighborhoodMap.ts` renders and queries surfaces/collisions
- `src/game/Bike.ts` handles movement and bike/rider animation state
- `src/game/Newspaper.ts` handles throw motion and lifecycle
- `src/scenes/NeighborhoodScene.ts` wires the playable scene together

## Add a new neighborhood

1. Create a new `NeighborhoodDefinition` in `src/world/neighborhoods.ts`
2. Add a legend and rows array
3. Set a player spawn point
4. Swap the selected neighborhood in `NeighborhoodScene.ts`

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
