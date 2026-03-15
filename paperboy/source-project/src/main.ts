import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { NeighborhoodScene } from './scenes/NeighborhoodScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#11161d',
  width: 1280,
  height: 720,
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, NeighborhoodScene],
};

new Phaser.Game(config);
