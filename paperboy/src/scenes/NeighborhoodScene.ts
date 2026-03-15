import Phaser from 'phaser';
import { Bike } from '../game/Bike';
import { Newspaper } from '../game/Newspaper';
import { NeighborhoodMap } from '../world/NeighborhoodMap';
import { neighborhoods } from '../world/neighborhoods';

export class NeighborhoodScene extends Phaser.Scene {
  private bike!: Bike;
  private neighborhoodMap!: NeighborhoodMap;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private newspapers: Newspaper[] = [];
  private cooldownMs = 0;

  constructor() {
    super('neighborhood');
  }

  create(): void {
    const neighborhood = neighborhoods['maple-street'];
    this.neighborhoodMap = new NeighborhoodMap(this, neighborhood);
    this.neighborhoodMap.build();

    this.physics.world.setBounds(0, 0, this.neighborhoodMap.worldWidth, this.neighborhoodMap.worldHeight);
    this.cameras.main.setBounds(0, 0, this.neighborhoodMap.worldWidth, this.neighborhoodMap.worldHeight);
    this.cameras.main.setZoom(1.15);
    this.cameras.main.setRoundPixels(false);

    const spawn = neighborhood.playerSpawn;
    const spawnX = spawn.x * neighborhood.tileSize;
    const spawnY = spawn.y * neighborhood.tileSize;

    this.bike = new Bike(this, this.neighborhoodMap, spawnX, spawnY);
    this.cameras.main.startFollow(this.bike.root, true, 0.08, 0.08);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', this.tryThrow, this);
    this.input.keyboard!.on('keydown-SPACE', this.tryThrow, this);

    this.addHud();
  }

  update(_: number, delta: number): void {
    const deltaSeconds = delta / 1000;
    this.cooldownMs = Math.max(0, this.cooldownMs - delta);

    this.bike.update(deltaSeconds, this.cursors, this.wasd);
    this.newspapers = this.newspapers.filter((paper) => paper.update(deltaSeconds));
  }

  private tryThrow(): void {
    if (this.cooldownMs > 0) {
      return;
    }

    this.cooldownMs = 180;
    const pointer = this.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.cameras.main) ?? new Phaser.Math.Vector2(this.bike.root.x, this.bike.root.y);

    const throwDirection = new Phaser.Math.Vector2(worldPoint.x - this.bike.root.x, worldPoint.y - this.bike.root.y);
    if (throwDirection.lengthSq() < 10) {
      throwDirection.copy(this.bike.aimDirection);
    }
    throwDirection.normalize();

    const spawn = new Phaser.Math.Vector2(this.bike.root.x, this.bike.root.y).add(throwDirection.clone().scale(28));

    const paper = new Newspaper(this, this.neighborhoodMap, {
      x: spawn.x,
      y: spawn.y,
      direction: throwDirection,
      inheritedVelocity: this.bike.velocity,
    });

    this.newspapers.push(paper);
    this.tweens.add({
      targets: [this.bike.rider],
      angle: { from: 0, to: 16 },
      duration: 65,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  private addHud(): void {
    const help = [
      'Paperboy Neighborhood Prototype',
      'Move: Arrow keys or WASD',
      'Throw: Mouse click or Space',
      'Ride the streets, cut across lawns, use driveways, turn at intersections',
    ].join('\n');

    const panel = this.add.rectangle(18, 18, 490, 104, 0x091018, 0.72).setOrigin(0, 0);
    panel.setScrollFactor(0);
    panel.setStrokeStyle(1, 0xffffff, 0.09);

    const text = this.add.text(32, 30, help, {
      fontFamily: 'Arial',
      fontSize: '18px',
      lineSpacing: 5,
      color: '#eef2f7',
    });
    text.setScrollFactor(0);
  }
}
