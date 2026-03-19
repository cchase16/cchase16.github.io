import { DEFAULT_BALLS, DEFAULT_THEME_ID } from "./config.js";

export function createDefaultSettings(catalog) {
  const firstSoundId = catalog.sounds[0]?.id || "";
  const firstTrackId = catalog.tracks[0]?.id || "";

  return {
    ballSpeed: 1,
    themeId: DEFAULT_THEME_ID,
    selectedTrackId: firstTrackId,
    launcherSoundId: firstSoundId,
    categorySoundAssignments: {}
  };
}

export function createGameState() {
  return {
    mode: "loading",
    statusMessage: "Booting manifests...",
    currentLevel: null,
    bricks: [],
    obstacles: [],
    launcher: {
      x: 0,
      y: 0,
      width: 158,
      height: 18,
      speed: 560
    },
    activeBall: null,
    ballsRemaining: DEFAULT_BALLS,
    maxBalls: DEFAULT_BALLS,
    score: 0,
    streakScore: 0,
    streak: 0,
    scoreMultiplier: 1,
    brickHits: 0,
    multiplierFlash: null,
    fieldMetrics: null,
    lastGeneratedSeed: null
  };
}
