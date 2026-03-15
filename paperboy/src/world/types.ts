export type TileKind =
  | 'road'
  | 'intersection'
  | 'sidewalk'
  | 'lawn'
  | 'driveway'
  | 'house'
  | 'hedge';

export type NeighborhoodLegendKey = string;

export interface NeighborhoodTileRule {
  kind: TileKind;
  collides?: boolean;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface NeighborhoodDefinition {
  id: string;
  name: string;
  tileSize: number;
  legend: Record<NeighborhoodLegendKey, NeighborhoodTileRule>;
  rows: string[];
  playerSpawn: SpawnPoint;
}
