import Phaser from 'phaser';
import { NeighborhoodMap } from '../world/NeighborhoodMap';

export class Bike {
  readonly root: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Rectangle;
  readonly frontWheel: Phaser.GameObjects.Arc;
  readonly backWheel: Phaser.GameObjects.Arc;
  readonly rider: Phaser.GameObjects.Rectangle;
  readonly leftLeg: Phaser.GameObjects.Rectangle;
  readonly rightLeg: Phaser.GameObjects.Rectangle;
  readonly velocity = new Phaser.Math.Vector2();
  readonly aimDirection = new Phaser.Math.Vector2(1, 0);

  private readonly scene: Phaser.Scene;
  private readonly map: NeighborhoodMap;
  private headingRadians = 0;
  private speed = 0;
  private pedalingPhase = 0;

  constructor(scene: Phaser.Scene, map: NeighborhoodMap, x: number, y: number) {
    this.scene = scene;
    this.map = map;

    this.backWheel = scene.add.circle(-16, 0, 10, 0x1c2430) as Phaser.GameObjects.Arc;
    this.frontWheel = scene.add.circle(16, 0, 10, 0x1c2430) as Phaser.GameObjects.Arc;
    this.body = scene.add.rectangle(0, -2, 38, 8, 0xc53e3e);
    this.body.setStrokeStyle(2, 0xf8b4b4, 0.8);
    this.rider = scene.add.rectangle(0, -18, 16, 18, 0x2c5282);
    this.leftLeg = scene.add.rectangle(-6, -6, 6, 18, 0x2d3748);
    this.rightLeg = scene.add.rectangle(6, -6, 6, 18, 0x2d3748);

    this.root = scene.add.container(x, y, [
      this.backWheel,
      this.frontWheel,
      this.leftLeg,
      this.rightLeg,
      this.body,
      this.rider,
    ]);
    this.root.setSize(42, 42);
  }

  update(deltaSeconds: number, cursors: Phaser.Types.Input.Keyboard.CursorKeys, wasd: Record<string, Phaser.Input.Keyboard.Key>): void {
    const steerInput = (cursors.left.isDown || wasd.a.isDown ? -1 : 0) + (cursors.right.isDown || wasd.d.isDown ? 1 : 0);
    const accelInput = (cursors.up.isDown || wasd.w.isDown ? 1 : 0) + (cursors.down.isDown || wasd.s.isDown ? -0.65 : 0);

    const surface = this.map.getSurfaceAtWorldPosition(this.root.x, this.root.y);
    const maxSpeed = surface.maxSpeed;
    const acceleration = surface.acceleration;
    const steerStrength = Phaser.Math.DegToRad(170) * deltaSeconds * Phaser.Math.Clamp((Math.abs(this.speed) / 70) + 0.2, 0.25, 1.2);

    if (accelInput !== 0) {
      this.speed += acceleration * accelInput * deltaSeconds;
    } else {
      this.speed *= surface.drag;
    }

    this.speed = Phaser.Math.Clamp(this.speed, -maxSpeed * 0.45, maxSpeed);

    if (Math.abs(this.speed) < 4 && accelInput === 0) {
      this.speed = 0;
    }

    if (steerInput !== 0 && this.speed !== 0) {
      this.headingRadians += steerInput * steerStrength * Phaser.Math.Clamp(Math.abs(this.speed) / Math.max(maxSpeed, 1), 0.35, 1);
    }

    this.aimDirection.setTo(Math.cos(this.headingRadians), Math.sin(this.headingRadians)).normalize();
    this.velocity.copy(this.aimDirection).scale(this.speed);

    const nextX = this.root.x + this.velocity.x * deltaSeconds;
    const nextY = this.root.y + this.velocity.y * deltaSeconds;

    if (!this.map.isBlockedAtWorldPosition(nextX, this.root.y)) {
      this.root.x = nextX;
    } else {
      this.speed *= -0.18;
    }

    if (!this.map.isBlockedAtWorldPosition(this.root.x, nextY)) {
      this.root.y = nextY;
    } else {
      this.speed *= -0.18;
    }

    this.root.rotation = this.headingRadians;
    this.animate(deltaSeconds, steerInput);
  }

  private animate(deltaSeconds: number, steerInput: number): void {
    this.pedalingPhase += deltaSeconds * Phaser.Math.Clamp(Math.abs(this.speed) * 0.09, 0, 16);
    const pedalOffset = Math.sin(this.pedalingPhase) * 4;
    const riderLean = Phaser.Math.Clamp(steerInput * Math.abs(this.speed) * 0.0025, -0.35, 0.35);

    this.leftLeg.y = -6 + pedalOffset;
    this.rightLeg.y = -6 - pedalOffset;
    this.rider.x = riderLean * 16;
    this.rider.rotation = riderLean * 0.6;
  }
}
