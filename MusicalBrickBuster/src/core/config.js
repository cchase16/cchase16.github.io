export const THEMES = [
  {
    id: "arcade-sunrise",
    name: "Arcade Sunrise",
    backgroundTop: "#fff0c9",
    backgroundBottom: "#f28c58",
    fieldBase: "#1e1b2f",
    fieldGlow: "#2f2b48",
    grid: "rgba(255, 255, 255, 0.08)",
    lane: "#251f39",
    laneStripe: "rgba(255, 180, 104, 0.18)",
    launcher: "#f0c44d",
    launcherEdge: "#fff3b2",
    ball: "#fff9f2",
    ballGlow: "rgba(255, 251, 240, 0.5)",
    text: "#fff3e0",
    panel: "rgba(36, 31, 57, 0.82)",
    accent: "#ff9e5e",
    shadow: "rgba(0, 0, 0, 0.3)",
    obstacleStripe: "rgba(255, 255, 255, 0.14)"
  },
  {
    id: "midnight-pulse",
    name: "Midnight Pulse",
    backgroundTop: "#0f1530",
    backgroundBottom: "#243d75",
    fieldBase: "#08101f",
    fieldGlow: "#142342",
    grid: "rgba(94, 154, 255, 0.12)",
    lane: "#0f1a31",
    laneStripe: "rgba(110, 180, 255, 0.12)",
    launcher: "#7cd1ff",
    launcherEdge: "#d8f6ff",
    ball: "#f3f9ff",
    ballGlow: "rgba(116, 209, 255, 0.36)",
    text: "#e5f4ff",
    panel: "rgba(8, 16, 31, 0.76)",
    accent: "#62b0ff",
    shadow: "rgba(0, 0, 0, 0.42)",
    obstacleStripe: "rgba(255, 255, 255, 0.08)"
  },
  {
    id: "mint-groove",
    name: "Mint Groove",
    backgroundTop: "#dff6de",
    backgroundBottom: "#6ec6a7",
    fieldBase: "#11312b",
    fieldGlow: "#184139",
    grid: "rgba(209, 255, 233, 0.09)",
    lane: "#143730",
    laneStripe: "rgba(193, 255, 210, 0.12)",
    launcher: "#f7ef8a",
    launcherEdge: "#fff9ca",
    ball: "#ffffff",
    ballGlow: "rgba(255, 255, 255, 0.34)",
    text: "#ecfff2",
    panel: "rgba(17, 49, 43, 0.76)",
    accent: "#9df3c9",
    shadow: "rgba(0, 0, 0, 0.34)",
    obstacleStripe: "rgba(255, 255, 255, 0.1)"
  }
];

export const DEFAULT_THEME_ID = "arcade-sunrise";
export const DEFAULT_LEVEL_PATH = "data/levels/level-001.xml";
export const DEFAULT_BALLS = 5;
export const BASE_BALL_SPEED = 530;
export const FIXED_TIMESTEP = 1 / 120;

export const FIELD_BOUNDS = {
  x: 90,
  y: 92,
  width: 1100,
  height: 620
};

export const GRID_LAYOUT = {
  leftInset: 42,
  topInset: 36,
  rowHeight: 38,
  cellPadding: 4
};

export const HUD_LAYOUT = {
  top: 22,
  left: 28
};
