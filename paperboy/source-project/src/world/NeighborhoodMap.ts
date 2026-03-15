import Phaser from 'phaser';
import type { NeighborhoodDefinition, TileKind } from './types';

interface SurfaceConfig {
  drag: number;
  acceleration: number;
  maxSpeed: number;
}

const SURFACE_CONFIG: Record<TileKind, SurfaceConfig> = {
  road: { drag: 0.91, acceleration: 620, maxSpeed: 255 },
  intersection: { drag: 0.915, acceleration: 620, maxSpeed: 260 },
  sidewalk: { drag: 0.88, acceleration: 470, maxSpeed: 195 },
  lawn: { drag: 0.84, acceleration: 350, maxSpeed: 145 },
  driveway: { drag: 0.89, acceleration: 500, maxSpeed: 205 },
  house: { drag: 0.8, acceleration: 0, maxSpeed: 0 },
  hedge: { drag: 0.8, acceleration: 0, maxSpeed: 0 },
};

const COLORS: Record<TileKind, number> = {
  road: 0x58606c,
  intersection: 0x626b79,
  sidewalk: 0xcabfa8,
  lawn: 0x7ea66a,
  driveway: 0xb8aca2,
  house: 0x85725f,
  hedge: 0x567448,
};

export class NeighborhoodMap {
  readonly definition: NeighborhoodDefinition;
  readonly tileSize: number;
  readonly width: number;
  readonly height: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  private readonly scene: Phaser.Scene;
  private readonly collisionRects: Phaser.Geom.Rectangle[] = [];

  constructor(scene: Phaser.Scene, definition: NeighborhoodDefinition) {
    this.scene = scene;
    this.definition = definition;
    this.tileSize = definition.tileSize;
    this.height = definition.rows.length;
    this.width = definition.rows[0]?.length ?? 0;
    this.worldWidth = this.width * this.tileSize;
    this.worldHeight = this.height * this.tileSize;
  }

  build(): void {
    const g = this.scene.add.graphics();

    for (let rowIndex = 0; rowIndex < this.definition.rows.length; rowIndex += 1) {
      const row = this.definition.rows[rowIndex];
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        const symbol = row[colIndex];
        const rule = this.definition.legend[symbol];
        if (!rule) {
          throw new Error(`Unknown map symbol '${symbol}' at row ${rowIndex}, col ${colIndex}`);
        }

        const x = colIndex * this.tileSize;
        const y = rowIndex * this.tileSize;
        const kind = rule.kind;

        g.fillStyle(COLORS[kind], 1);
        g.fillRect(x, y, this.tileSize, this.tileSize);

        this.addTileDecoration(g, kind, x, y);

        if (rule.collides) {
          this.collisionRects.push(new Phaser.Geom.Rectangle(x, y, this.tileSize, this.tileSize));
        }
      }
    }

    g.lineStyle(1, 0x000000, 0.08);
    for (let x = 0; x <= this.worldWidth; x += this.tileSize) {
      g.lineBetween(x, 0, x, this.worldHeight);
    }
    for (let y = 0; y <= this.worldHeight; y += this.tileSize) {
      g.lineBetween(0, y, this.worldWidth, y);
    }
  }

  getSurfaceAtWorldPosition(x: number, y: number): SurfaceConfig {
    const tile = this.getTileKindAtWorldPosition(x, y);
    return SURFACE_CONFIG[tile];
  }

  isBlockedAtWorldPosition(x: number, y: number): boolean {
    return this.collisionRects.some((rect) => rect.contains(x, y));
  }

  clampPointToWorld(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    point.x = Phaser.Math.Clamp(point.x, 0, this.worldWidth);
    point.y = Phaser.Math.Clamp(point.y, 0, this.worldHeight);
    return point;
  }

  private getTileKindAtWorldPosition(x: number, y: number): TileKind {
    const tileX = Phaser.Math.Clamp(Math.floor(x / this.tileSize), 0, this.width - 1);
    const tileY = Phaser.Math.Clamp(Math.floor(y / this.tileSize), 0, this.height - 1);
    const row = this.definition.rows[tileY];
    const symbol = row[tileX];
    const rule = this.definition.legend[symbol];
    return rule.kind;
  }

  private addTileDecoration(g: Phaser.GameObjects.Graphics, kind: TileKind, x: number, y: number): void {
    switch (kind) {
      case 'road':
      case 'intersection': {
        g.lineStyle(3, 0xf3e8ad, 0.33);
        g.lineBetween(x + this.tileSize * 0.5, y + 10, x + this.tileSize * 0.5, y + this.tileSize - 10);
        break;
      }
      case 'driveway': {
        g.fillStyle(0xffffff, 0.08);
        g.fillRect(x + 10, y + 8, this.tileSize - 20, this.tileSize - 16);
        break;
      }
      case 'house': {
        g.fillStyle(0xd8c9bb, 0.45);
        g.fillRect(x + 8, y + 10, this.tileSize - 16, this.tileSize - 18);
        g.fillStyle(0x48382b, 0.9);
        g.fillRect(x + this.tileSize * 0.38, y + this.tileSize * 0.52, this.tileSize * 0.22, this.tileSize * 0.28);
        break;
      }
      case 'hedge': {
        g.fillStyle(0x435f39, 0.75);
        g.fillRect(x + 4, y + 18, this.tileSize - 8, this.tileSize - 36);
        break;
      }
      default:
        break;
    }
  }
}
