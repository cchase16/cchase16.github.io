import { createRng } from "../core/rng.js";

function makeId() {
  return `generated-${new Date().toISOString().replaceAll(/[-:T.Z]/g, "").slice(0, 14)}`;
}

function occupancyKey(col, row) {
  return `${col},${row}`;
}

export function generateProceduralLevel(catalog, options = {}) {
  const gridColumns = options.gridColumns || 12;
  const gridRows = options.gridRows || 8;
  const density = options.brickDensity || 0.44;
  const obstacleDensity = options.obstacleDensity || 0.14;
  const seed = options.seed || `MBB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const rng = createRng(seed);

  const categories = catalog.categories;
  const obstacleTypes = catalog.obstacleTypes.filter((type) => type.widthUnits === 2 && type.heightUnits === 2);
  const occupied = new Set();
  const bricks = [];
  const obstacles = [];

  const obstacleRows = [3, 4, 5];
  const maxObstacleCount = Math.max(1, Math.floor(gridColumns * obstacleDensity * 0.5));

  while (obstacles.length < maxObstacleCount && obstacleTypes.length) {
    const type = rng.pick(obstacleTypes);
    const col = rng.int(0, Math.max(0, gridColumns - type.widthUnits));
    const row = rng.pick(obstacleRows);
    let fits = true;

    for (let rowOffset = 0; rowOffset < type.heightUnits; rowOffset += 1) {
      for (let colOffset = 0; colOffset < type.widthUnits; colOffset += 1) {
        if (occupied.has(occupancyKey(col + colOffset, row + rowOffset))) {
          fits = false;
        }
      }
    }

    if (!fits) {
      continue;
    }

    obstacles.push({
      id: `obstacle-${obstacles.length + 1}`,
      typeId: type.id,
      col,
      row
    });

    for (let rowOffset = 0; rowOffset < type.heightUnits; rowOffset += 1) {
      for (let colOffset = 0; colOffset < type.widthUnits; colOffset += 1) {
        occupied.add(occupancyKey(col + colOffset, row + rowOffset));
      }
    }
  }

  for (let row = 0; row < gridRows - 1; row += 1) {
    for (let col = 0; col < gridColumns; col += 1) {
      if (row > 5) {
        continue;
      }
      if (occupied.has(occupancyKey(col, row))) {
        continue;
      }

      const edgeBoost = col === 0 || col === gridColumns - 1 ? 0.22 : 0;
      const rowBoost = row <= 1 ? 0.18 : 0;
      if (rng.next() > density + edgeBoost + rowBoost) {
        continue;
      }

      const category = rng.pick(categories);
      bricks.push({
        id: `brick-${bricks.length + 1}`,
        categoryId: category.id,
        col,
        row
      });
      occupied.add(occupancyKey(col, row));
    }
  }

  if (!bricks.length && categories.length) {
    bricks.push({
      id: "brick-1",
      categoryId: categories[0].id,
      col: Math.floor(gridColumns / 2),
      row: 1
    });
  }

  return {
    id: makeId(),
    metadata: {
      name: "Random Groove Field",
      author: "Generator",
      source: "generated",
      gridColumns,
      gridRows,
      seed
    },
    bricks,
    obstacles
  };
}
