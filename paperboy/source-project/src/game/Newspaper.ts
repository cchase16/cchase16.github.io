import Phaser from 'phaser';
import { NeighborhoodMap } from '../world/NeighborhoodMap';

export interface ThrowSpec {
  x: number;
  y: number;
  direction: Phaser.Math.Vector2;
  inheritedVelocity: Phaser.Math.Vector2;
}

export class Newspaper {
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly sprite: Phaser.GameObjects.Rectangle;
  readonly velocity = new Phaser.Math.Vector2();
  readonly direction = new Phaser.Math.Vector2();

  private readonly scene: Phaser.Scene;
  private readonly map: NeighborhoodMap;
  private alive = true;
  private height = 18;
  private verticalVelocity = 190;
  private rotationSpeed = 0;
  private groundDrag = 0.985;

  constructor(scene: Phaser.Scene, map: NeighborhoodMap, spec: ThrowSpec) {
    this.scene = scene;
    this.map = map;

    this.direction.copy(spec.direction).normalize();
    this.velocity.copy(spec.direction).scale(360).add(spec.inheritedVelocity.clone().scale(0.45));
    this.rotationSpeed = Phaser.Math.FloatBetween(7, 11) * (Math.random() > 0.5 ? 1 : -1);

    this.shadow = scene.add.ellipse(spec.x, spec.y, 18, 8, 0x000000, 0.22);
    this.sprite = scene.add.rectangle(spec.x, spec.y - this.height, 18, 10, 0xf0f2f5, 1);
    this.sprite.setStrokeStyle(1, 0xcfd7df, 0.9);
  }

  update(deltaSeconds: number): boolean {
    if (!this.alive) {
      return false;
    }

    const prevX = this.shadow.x;
    const prevY = this.shadow.y;

    this.shadow.x += this.velocity.x * deltaSeconds;
    this.shadow.y += this.velocity.y * deltaSeconds;

    this.height += this.verticalVelocity * deltaSeconds;
    this.verticalVelocity -= 620 * deltaSeconds;

    const hitWorldEdge =
      this.shadow.x <= 0 ||
      this.shadow.y <= 0 ||
      this.shadow.x >= this.map.worldWidth ||
      this.shadow.y >= this.map.worldHeight;

    if (hitWorldEdge || this.map.isBlockedAtWorldPosition(this.shadow.x, this.shadow.y)) {
      this.shadow.setPosition(prevX, prevY);
      this.velocity.scale(0.28);
      this.verticalVelocity = 0;
      this.height = 0;
    }

    if (this.height <= 0) {
      this.height = 0;
      this.verticalVelocity = 0;
      this.velocity.scale(this.groundDrag);
    }

    const speed = this.velocity.length();
    if (speed < 16 && this.height <= 0) {
      this.destroy();
      return false;
    }

    this.sprite.setPosition(this.shadow.x, this.shadow.y - this.height);
    this.sprite.rotation += this.rotationSpeed * deltaSeconds;
    this.shadow.setScale(1 + this.height * 0.008, 1 + this.height * 0.003);
    this.shadow.setAlpha(Phaser.Math.Clamp(0.25 - this.height * 0.004, 0.06, 0.25));

    return true;
  }

  destroy(): void {
    this.alive = false;
    this.shadow.destroy();
    this.sprite.destroy();
  }
}
