import { DEFAULT_BALLS, DEFAULT_LEVEL_PATH, FIXED_TIMESTEP, THEMES, BASE_BALL_SPEED } from "./config.js";
import { createDefaultSettings, createGameState } from "./state.js";
import { fetchXmlDocument } from "../data/xmlLoader.js";
import {
  parseLevelDocument,
  validateLevel,
  sanitizeImportedSettings
} from "../data/manifestParsers.js";
import { parseLevelXml, serializeLevel } from "../data/levelSerializer.js";
import { parseSettingsXml, serializeSettings } from "../data/settingsSerializer.js";
import { loadCatalog } from "../data/catalogLoader.js";
import { InputController } from "../engine/input.js";
import { AudioManager } from "../engine/audioManager.js";
import { Renderer } from "../engine/renderer.js";
import { generateProceduralLevel } from "../gameplay/proceduralGenerator.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function reflectVelocity(ball, normalX, normalY) {
  const dot = ball.vx * normalX + ball.vy * normalY;
  ball.vx -= 2 * dot * normalX;
  ball.vy -= 2 * dot * normalY;
}

function getScoreMultiplierForStreak(streak) {
  if (streak >= 15) {
    return 3;
  }
  if (streak >= 10) {
    return 2;
  }
  if (streak >= 5) {
    return 1.5;
  }
  return 1;
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: "text/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readSelectedFile(inputElement) {
  const file = inputElement.files?.[0];
  if (!file) {
    return Promise.resolve("");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

function circleRectCollision(ball, rect) {
  const nearestX = clamp(ball.x, rect.x, rect.x + rect.width);
  const nearestY = clamp(ball.y, rect.y, rect.y + rect.height);
  const dx = ball.x - nearestX;
  const dy = ball.y - nearestY;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared > ball.radius * ball.radius) {
    return null;
  }

  let normalX = 0;
  let normalY = 0;

  if (distanceSquared === 0) {
    const distances = [
      { value: Math.abs(ball.x - rect.x), nx: -1, ny: 0 },
      { value: Math.abs(rect.x + rect.width - ball.x), nx: 1, ny: 0 },
      { value: Math.abs(ball.y - rect.y), nx: 0, ny: -1 },
      { value: Math.abs(rect.y + rect.height - ball.y), nx: 0, ny: 1 }
    ].sort((left, right) => left.value - right.value);
    normalX = distances[0].nx;
    normalY = distances[0].ny;
  } else {
    const normal = normalizeVector(dx, dy);
    normalX = normal.x;
    normalY = normal.y;
  }

  const penetration = ball.radius - Math.sqrt(distanceSquared || 0.0001);
  return { normalX, normalY, penetration };
}

export class GameApp {
  constructor(documentNode, options = {}) {
    this.document = documentNode;
    this.canvas = documentNode.getElementById("game-canvas");
    this.renderer = new Renderer(this.canvas);
    this.input = new InputController(window);
    this.audio = new AudioManager();
    this.state = createGameState();
    this.catalog = null;
    this.settings = null;
    this.animationFrameId = 0;
    this.accumulator = 0;
    this.lastFrameTime = 0;
    this.isLoopRunning = false;
    this.isFullscreenActive = false;
    this.isTouchLayout = false;
    this.isPortraitMobile = false;
    this.touchSession = {
      pointerId: null,
      dragging: false,
      moved: false,
      startX: 0,
      startY: 0
    };
    this.themeById = new Map(THEMES.map((theme) => [theme.id, theme]));
    this.startupState = options.startupState || null;
    this.shouldAutoFullscreen = Boolean(this.startupState?.autoFullscreen);
  }

  async init() {
    this.cacheDom();
    this.updateResponsiveMode();
    this.bindUi();
    this.bindCanvasTouchControls();
    this.exposeTestingHooks();

    try {
      this.catalog = await loadCatalog();
      this.settings = createDefaultSettings(this.catalog);
      this.audio.preload(this.catalog);
      this.applyStartupSettings();
      this.populateUiOptions();
      await this.bootstrapLevel();
      this.applySettingsToUi();
      this.state.mode = "ready";
      this.setStatus(this.getLaunchPrompt());
    } catch (error) {
      this.state.mode = "error";
      this.setStatus(error.message);
      console.error(error);
    }

    this.render();
    this.requestAutoFullscreen();
    this.startLoop();
  }

  cacheDom() {
    this.dom = {
      startButton: this.document.getElementById("start-button"),
      restartButton: this.document.getElementById("restart-button"),
      generateButton: this.document.getElementById("generate-button"),
      exportLevelButton: this.document.getElementById("export-level-button"),
      levelImportInput: this.document.getElementById("level-import-input"),
      exportSettingsButton: this.document.getElementById("export-settings-button"),
      settingsImportInput: this.document.getElementById("settings-import-input"),
      ballSpeedInput: this.document.getElementById("ball-speed-input"),
      ballSpeedValue: this.document.getElementById("ball-speed-value"),
      themeSelect: this.document.getElementById("theme-select"),
      launcherSoundSelect: this.document.getElementById("launcher-sound-select"),
      categoryAssignments: this.document.getElementById("category-sound-assignments"),
      trackSelect: this.document.getElementById("track-select"),
      playTrackButton: this.document.getElementById("play-track-button"),
      stopTrackButton: this.document.getElementById("stop-track-button"),
      mobileMenuButton: this.document.getElementById("mobile-menu-button"),
      mobilePauseButton: this.document.getElementById("mobile-pause-button"),
      mobileFullscreenButton: this.document.getElementById("mobile-fullscreen-button"),
      mobileCloseButton: this.document.getElementById("mobile-close-button"),
      drawerBackdrop: this.document.getElementById("drawer-backdrop"),
      rotateOverlay: this.document.getElementById("rotate-overlay"),
      trackDescription: this.document.getElementById("track-description"),
      levelName: this.document.getElementById("level-name"),
      levelSource: this.document.getElementById("level-source"),
      modeLabel: this.document.getElementById("mode-label"),
      statusMessage: this.document.getElementById("status-message"),
      gamePanel: this.document.querySelector(".game-panel")
    };
  }

  bindUi() {
    this.dom.startButton?.addEventListener("click", () => {
      this.audio.unlock();
      if (this.state.mode === "paused") {
        this.state.mode = "playing";
        this.setStatus("Back in the groove.");
      } else if (["ready", "won", "lost"].includes(this.state.mode)) {
        this.resetCurrentLevel();
      }
      this.closeDrawer();
    });

    this.dom.restartButton?.addEventListener("click", () => {
      this.audio.unlock();
      this.resetCurrentLevel();
      this.closeDrawer();
    });

    this.dom.generateButton?.addEventListener("click", () => {
      this.audio.unlock();
      if (!this.catalog) {
        return;
      }
      const level = generateProceduralLevel(this.catalog);
      this.loadLevelObject(level);
      this.setStatus(`Generated a new field with seed ${level.metadata.seed}.`);
      this.closeDrawer();
    });

    this.dom.exportLevelButton?.addEventListener("click", () => {
      if (!this.state.currentLevel) {
        return;
      }
      downloadTextFile(`${this.state.currentLevel.id}.xml`, serializeLevel(this.state.currentLevel));
      this.setStatus("Exported the current field as XML.");
    });

    this.dom.levelImportInput?.addEventListener("change", async () => {
      try {
        const xmlText = await readSelectedFile(this.dom.levelImportInput);
        if (!xmlText) {
          return;
        }
        const importedLevel = parseLevelXml(xmlText);
        importedLevel.metadata.source = "imported";
        this.loadLevelObject(importedLevel);
        this.setStatus(`Imported level "${importedLevel.metadata.name}".`);
      } catch (error) {
        this.setStatus(`Level import failed: ${error.message}`);
      } finally {
        this.dom.levelImportInput.value = "";
      }
    });

    this.dom.exportSettingsButton?.addEventListener("click", () => {
      downloadTextFile("settings.xml", serializeSettings(this.settings));
      this.setStatus("Exported current customization settings.");
    });

    this.dom.settingsImportInput?.addEventListener("change", async () => {
      try {
        const xmlText = await readSelectedFile(this.dom.settingsImportInput);
        if (!xmlText) {
          return;
        }
        const importedSettings = parseSettingsXml(xmlText);
        const validThemeIds = new Set(THEMES.map((theme) => theme.id));
        this.settings = sanitizeImportedSettings(importedSettings, this.catalog, validThemeIds);
        this.applySettingsToUi();
        this.audio.stopTrack();
        this.updateTrackDescription();
        this.setStatus("Imported customization settings.");
      } catch (error) {
        this.setStatus(`Settings import failed: ${error.message}`);
      } finally {
        this.dom.settingsImportInput.value = "";
      }
    });

    this.dom.ballSpeedInput?.addEventListener("input", () => {
      this.settings.ballSpeed = Number.parseFloat(this.dom.ballSpeedInput.value);
      this.syncGameplaySpeeds();
      this.applySettingsToUi();
      this.setStatus(`Ball speed set to ${this.settings.ballSpeed.toFixed(2)}x.`);
    });

    this.dom.themeSelect?.addEventListener("change", () => {
      this.settings.themeId = this.dom.themeSelect.value;
      this.applySettingsToUi();
      this.setStatus(`Theme switched to ${this.themeById.get(this.settings.themeId)?.name || this.settings.themeId}.`);
    });

    this.dom.launcherSoundSelect?.addEventListener("change", () => {
      this.settings.launcherSoundId = this.dom.launcherSoundSelect.value;
      this.setStatus("Launcher sound updated.");
    });

    this.dom.trackSelect?.addEventListener("change", () => {
      this.settings.selectedTrackId = this.dom.trackSelect.value;
      this.updateTrackDescription();
      this.audio.playTrack(this.settings.selectedTrackId);
      this.setStatus("Jukebox selection updated.");
    });

    this.dom.playTrackButton?.addEventListener("click", () => {
      this.audio.unlock();
      this.audio.playTrack(this.settings.selectedTrackId);
      this.setStatus("Playing jukebox loop.");
    });

    this.dom.stopTrackButton?.addEventListener("click", () => {
      this.audio.stopTrack();
      this.setStatus("Stopped jukebox playback.");
    });

    this.document.addEventListener("fullscreenchange", () => {
      this.isFullscreenActive = this.document.fullscreenElement === this.dom.gamePanel;
      this.document.body.classList.toggle("fullscreen-game", this.isFullscreenActive);
    });

    this.dom.mobileMenuButton?.addEventListener("click", () => {
      this.audio.unlock();
      this.toggleDrawer();
    });

    this.dom.mobilePauseButton?.addEventListener("click", () => {
      this.audio.unlock();
      this.togglePause();
    });

    this.dom.mobileFullscreenButton?.addEventListener("click", () => {
      this.audio.unlock();
      this.toggleFullscreen();
    });

    this.dom.mobileCloseButton?.addEventListener("click", () => {
      this.closeDrawer();
    });

    this.dom.drawerBackdrop?.addEventListener("click", () => {
      this.closeDrawer();
    });

    window.addEventListener("resize", () => {
      this.updateResponsiveMode();
    });
  }

  bindCanvasTouchControls() {
    this.canvas.addEventListener("pointerdown", (event) => this.handleCanvasPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.handleCanvasPointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.handleCanvasPointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.handleCanvasPointerCancel(event));
  }

  exposeTestingHooks() {
    window.render_game_to_text = () => this.renderGameToText();
    window.advanceTime = (milliseconds) => {
      this.advanceTime(milliseconds);
    };
  }

  updateEffectTimers(deltaSeconds) {
    if (this.state.multiplierFlash) {
      this.state.multiplierFlash.timer = Math.max(0, this.state.multiplierFlash.timer - deltaSeconds);
      if (this.state.multiplierFlash.timer <= 0) {
        this.state.multiplierFlash = null;
      }
    }

    for (const obstacle of this.state.obstacles) {
      if (!obstacle.hitAnimation) {
        continue;
      }
      obstacle.hitAnimation.timer = Math.max(0, obstacle.hitAnimation.timer - deltaSeconds);
      obstacle.contactCooldown = Math.max(0, (obstacle.contactCooldown || 0) - deltaSeconds);
    }
  }

  updateResponsiveMode() {
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    this.isTouchLayout = coarsePointer || window.innerWidth <= 900;
    this.isPortraitMobile = this.isTouchLayout && window.innerHeight > window.innerWidth;
    this.document.body.classList.toggle("touch-layout", this.isTouchLayout);
    this.document.body.classList.toggle("mobile-portrait", this.isPortraitMobile);
  }

  getLaunchPrompt() {
    return this.isTouchLayout ? "Tap to launch the first ball." : "Press Space to launch the first ball.";
  }

  getRetryPrompt() {
    return this.isTouchLayout ? "Tap to launch the next ball." : "Press Space to launch the next one.";
  }

  syncGameplaySpeeds() {
    if (!this.state?.launcher || !this.settings) {
      return;
    }

    this.state.launcher.speed = 560 * this.settings.ballSpeed;
  }

  toggleDrawer(force) {
    const shouldOpen = force ?? !this.document.body.classList.contains("mobile-drawer-open");
    this.document.body.classList.toggle("mobile-drawer-open", shouldOpen);
  }

  closeDrawer() {
    this.toggleDrawer(false);
  }

  togglePause() {
    if (this.state.mode === "playing") {
      this.state.mode = "paused";
      this.setStatus("Paused.");
    } else if (this.state.mode === "paused") {
      this.state.mode = "playing";
      this.setStatus("Resumed.");
    }
  }

  isTouchPointer(event) {
    return this.isTouchLayout && event.pointerType !== "mouse";
  }

  getCanvasPoint(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * this.canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * this.canvas.height
    };
  }

  isPointerControlZone(point) {
    if (!this.state.fieldMetrics) {
      return false;
    }

    const gridBottom = this.state.fieldMetrics.grid.top + this.state.fieldMetrics.grid.rows * this.state.fieldMetrics.grid.slotHeight;
    return point.y >= gridBottom + 18 && point.y <= this.state.fieldMetrics.field.bottom - 18;
  }

  moveLauncherToCanvasX(canvasX) {
    const nextX = canvasX - this.state.launcher.width / 2;
    this.state.launcher.x = clamp(
      nextX,
      this.state.fieldMetrics.field.x,
      this.state.fieldMetrics.field.right - this.state.launcher.width
    );
  }

  triggerLaunchFromTouch() {
    if (this.isPortraitMobile) {
      return;
    }

    if (this.state.mode === "ready") {
      this.state.mode = "playing";
    }

    if (this.state.mode === "playing" && !this.state.activeBall && this.state.ballsRemaining > 0) {
      this.launchBall();
    } else if (this.state.mode === "won" || this.state.mode === "lost") {
      this.resetCurrentLevel();
      this.state.mode = "playing";
      this.launchBall();
    }
  }

  handleCanvasPointerDown(event) {
    if (!this.isTouchPointer(event) || !this.state.currentLevel || this.isPortraitMobile) {
      return;
    }

    this.audio.unlock();
    this.closeDrawer();

    const point = this.getCanvasPoint(event);
    if (!this.isPointerControlZone(point)) {
      return;
    }

    this.touchSession = {
      pointerId: event.pointerId,
      dragging: true,
      moved: false,
      startX: point.x,
      startY: point.y
    };

    this.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();

    if (!["loading", "error", "paused"].includes(this.state.mode)) {
      this.moveLauncherToCanvasX(point.x);
    }
  }

  handleCanvasPointerMove(event) {
    if (this.touchSession.pointerId !== event.pointerId || !this.touchSession.dragging || this.isPortraitMobile) {
      return;
    }

    const point = this.getCanvasPoint(event);
    if (Math.abs(point.x - this.touchSession.startX) > 8 || Math.abs(point.y - this.touchSession.startY) > 8) {
      this.touchSession.moved = true;
    }

    if (!["loading", "error", "paused"].includes(this.state.mode)) {
      this.moveLauncherToCanvasX(point.x);
    }
    event.preventDefault();
  }

  handleCanvasPointerUp(event) {
    if (this.touchSession.pointerId !== event.pointerId) {
      return;
    }

    if (!this.touchSession.moved) {
      this.triggerLaunchFromTouch();
    }

    this.canvas.releasePointerCapture?.(event.pointerId);
    this.touchSession.pointerId = null;
    this.touchSession.dragging = false;
  }

  handleCanvasPointerCancel(event) {
    if (this.touchSession.pointerId !== event.pointerId) {
      return;
    }

    this.touchSession.pointerId = null;
    this.touchSession.dragging = false;
  }

  resetStreak() {
    this.state.streak = 0;
    this.state.scoreMultiplier = 1;
    this.state.streakScore = 0;
  }

  registerStreakCollision() {
    this.state.streak += 1;
    const previousMultiplier = this.state.scoreMultiplier;
    const nextMultiplier = getScoreMultiplierForStreak(this.state.streak);
    this.state.scoreMultiplier = nextMultiplier;

    if (nextMultiplier > previousMultiplier) {
      this.queueMultiplierFlash(nextMultiplier);
      this.audio.playMultiplierBlast(nextMultiplier);
    }

    return nextMultiplier;
  }

  queueMultiplierFlash(multiplierValue) {
    this.state.multiplierFlash = {
      label: `${multiplierValue.toFixed(2).replace(/\.00$/, "")}X`,
      timer: 1.25,
      duration: 1.25
    };
  }

  bankStreakScore() {
    if (this.state.streakScore <= 0) {
      this.resetStreak();
      return 0;
    }

    const banked = this.state.streakScore;
    this.state.score += banked;
    this.audio.playScoreBanked();
    this.resetStreak();
    return banked;
  }

  loseStreakScore() {
    const lost = this.state.streakScore;
    if (lost > 0) {
      this.audio.playSadLoss();
    }
    this.resetStreak();
    return lost;
  }

  awardScore(basePoints) {
    const speedAdjustedBase = Math.round(basePoints * this.settings.ballSpeed);
    this.state.score += speedAdjustedBase;
    const streakBonus = Math.round(speedAdjustedBase * Math.max(0, this.state.scoreMultiplier - 1));
    this.state.streakScore += streakBonus;
    return {
      basePoints: speedAdjustedBase,
      streakBonus
    };
  }

  getDefaultPowerUpType() {
    return this.catalog?.powerUpTypes?.[0] || null;
  }

  getPowerUpType(typeId) {
    return this.catalog?.powerUpTypeById?.get(typeId) || null;
  }

  getActivePowerUpType() {
    return this.state.activePowerUp ? this.getPowerUpType(this.state.activePowerUp.typeId) : null;
  }

  isObstaclePassThroughActive() {
    return this.getActivePowerUpType()?.effect === "pass-through-obstacles";
  }

  scheduleNextPowerUpSpawn(typeId = this.getDefaultPowerUpType()?.id) {
    const type = this.getPowerUpType(typeId) || this.getDefaultPowerUpType();
    if (!type) {
      this.state.nextPowerUpSpawnIn = Number.POSITIVE_INFINITY;
      return;
    }

    const randomWindow =
      type.spawnRandomMinSeconds + Math.random() * (type.spawnRandomMaxSeconds - type.spawnRandomMinSeconds);
    this.state.nextPowerUpSpawnIn = type.spawnBaseSeconds + randomWindow;
  }

  spawnPowerUp(typeId = this.getDefaultPowerUpType()?.id) {
    const type = this.getPowerUpType(typeId);
    if (!type || !this.state.fieldMetrics) {
      return;
    }

    const field = this.state.fieldMetrics.field;
    const horizontalMargin = 72;
    const spawnWidth = Math.max(40, field.width - horizontalMargin * 2);
    const x = field.x + horizontalMargin + Math.random() * spawnWidth;

    this.state.powerUpSequence += 1;
    this.state.fallingPowerUps.push({
      id: `power-up-${this.state.powerUpSequence}`,
      typeId: type.id,
      x,
      y: field.y + 30,
      baseX: x,
      radius: 18,
      vy: type.driftSpeed,
      driftAmplitude: 16 + Math.random() * 10,
      driftPhase: Math.random() * Math.PI * 2,
      rotation: (Math.random() - 0.5) * 0.16,
      rotationSpeed: (0.55 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1),
      glowPulse: Math.random() * Math.PI * 2
    });

    this.setStatus(`${type.name} is drifting into the field.`);
  }

  activatePowerUp(powerUp) {
    const type = this.getPowerUpType(powerUp.typeId);
    if (!type) {
      return;
    }

    this.state.activePowerUp = {
      typeId: type.id
    };
    this.setStatus(`${type.name} caught. The ball can pass through obstacles until it drops.`);
  }

  clearActivePowerUp() {
    const activeType = this.getActivePowerUpType();
    if (!activeType) {
      return null;
    }

    this.state.activePowerUp = null;
    return activeType;
  }

  updatePowerUps(deltaSeconds) {
    if (!this.state.fieldMetrics || !this.catalog?.powerUpTypes?.length) {
      return;
    }

    if (!Number.isFinite(this.state.nextPowerUpSpawnIn) || this.state.nextPowerUpSpawnIn <= 0) {
      if (!this.state.activePowerUp && this.state.fallingPowerUps.length === 0) {
        this.spawnPowerUp();
        this.scheduleNextPowerUpSpawn();
      } else {
        this.state.nextPowerUpSpawnIn = 5;
      }
    } else {
      this.state.nextPowerUpSpawnIn -= deltaSeconds;
    }

    const field = this.state.fieldMetrics.field;
    const remainingPowerUps = [];

    for (const powerUp of this.state.fallingPowerUps) {
      const type = this.getPowerUpType(powerUp.typeId);
      if (!type) {
        continue;
      }

      powerUp.y += powerUp.vy * deltaSeconds;
      powerUp.driftPhase += deltaSeconds * 2.8;
      powerUp.rotation += powerUp.rotationSpeed * deltaSeconds;
      powerUp.glowPulse += deltaSeconds * 4.8;
      powerUp.x = clamp(
        powerUp.baseX + Math.sin(powerUp.driftPhase) * powerUp.driftAmplitude,
        field.x + 32,
        field.right - 32
      );

      const pickupCollision = circleRectCollision(
        { x: powerUp.x, y: powerUp.y, radius: powerUp.radius },
        this.state.launcher
      );
      if (pickupCollision) {
        this.activatePowerUp(powerUp);
        continue;
      }

      if (powerUp.y - powerUp.radius <= field.bottom) {
        remainingPowerUps.push(powerUp);
      }
    }

    this.state.fallingPowerUps = remainingPowerUps;
  }

  startNextGeneratedRound() {
    const carriedScore = this.state.score;
    this.settings.ballSpeed = Number((this.settings.ballSpeed + 0.10).toFixed(2));
    const nextLevel = generateProceduralLevel(this.catalog);
    this.loadLevelObject(nextLevel);
    this.state.score = carriedScore;
    this.syncGameplaySpeeds();
    this.applySettingsToUi();
    this.setStatus(`New field ready at ${this.settings.ballSpeed.toFixed(2)}x speed. ${this.getLaunchPrompt()}`);
  }

  populateUiOptions() {
    if (!this.dom.themeSelect || !this.dom.launcherSoundSelect || !this.dom.trackSelect || !this.dom.categoryAssignments) {
      return;
    }

    this.populateSelect(
      this.dom.themeSelect,
      THEMES.map((theme) => ({ value: theme.id, label: theme.name }))
    );
    this.populateSelect(
      this.dom.launcherSoundSelect,
      this.catalog.sounds.map((sound) => ({ value: sound.id, label: `${sound.name} (${sound.family})` }))
    );
    this.populateSelect(
      this.dom.trackSelect,
      this.catalog.tracks.map((track) => ({ value: track.id, label: track.name }))
    );
    this.renderCategoryAssignments();
    this.updateTrackDescription();
  }

  populateSelect(selectElement, options) {
    selectElement.innerHTML = "";
    for (const option of options) {
      const element = this.document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      selectElement.append(element);
    }
  }

  renderCategoryAssignments() {
    if (!this.dom.categoryAssignments) {
      return;
    }

    this.dom.categoryAssignments.innerHTML = "";

    for (const category of this.catalog.categories) {
      const wrapper = this.document.createElement("label");
      wrapper.className = "assignments-row";

      const label = this.document.createElement("span");
      label.textContent = `${category.name} (${category.hitsToBreak} hits)`;
      wrapper.append(label);

      const select = this.document.createElement("select");
      this.populateSelect(
        select,
        this.catalog.sounds.map((sound) => ({
          value: sound.id,
          label: `${sound.name} (${sound.family})`
        }))
      );

      select.value = this.settings?.categorySoundAssignments?.[category.id] || category.defaultSoundId;
      select.addEventListener("change", () => {
        this.settings.categorySoundAssignments[category.id] = select.value;
        this.setStatus(`Updated ${category.name} sound assignment.`);
      });

      wrapper.append(select);
      this.dom.categoryAssignments.append(wrapper);
    }
  }

  async loadLevelFromPath(path) {
    const documentNode = await fetchXmlDocument(path);
    const level = parseLevelDocument(documentNode);
    this.loadLevelObject(level);
  }

  loadLevelObject(level) {
    validateLevel(level, this.catalog);
    this.state.currentLevel = structuredClone(level);
    this.resetCurrentLevel();
  }

  resetCurrentLevel() {
    if (!this.state.currentLevel) {
      return;
    }

    const level = this.state.currentLevel;
    const metrics = this.renderer.computeFieldMetrics(level);

    this.state = {
      ...createGameState(),
      mode: "ready",
      statusMessage: this.getLaunchPrompt(),
      currentLevel: structuredClone(level),
      ballsRemaining: DEFAULT_BALLS,
      maxBalls: DEFAULT_BALLS,
      launcher: {
        x: metrics.field.x + metrics.field.width / 2 - 79,
        y: metrics.field.bottom - 36,
        width: 158,
        height: 18,
        speed: 560 * this.settings.ballSpeed
      },
      fieldMetrics: metrics,
      score: 0,
      brickHits: 0,
      lastGeneratedSeed: level.metadata.seed || ""
    };

    this.state.bricks = level.bricks.map((brick) => {
      const category = this.catalog.categoryById.get(brick.categoryId);
      return {
        ...brick,
        hitsRemaining: category.hitsToBreak,
        destroyed: false,
        rect: this.renderer.computeRectFromPlacement(brick, metrics)
      };
    });

    this.state.obstacles = level.obstacles.map((obstacle) => {
      const type = this.catalog.obstacleTypeById.get(obstacle.typeId);
      return {
        ...obstacle,
        rect: this.renderer.computeRectFromPlacement(obstacle, metrics, type.widthUnits, type.heightUnits),
        hitAnimation: {
          timer: 0,
          duration: 0.18
        },
        contactCooldown: 0
      };
    });

    this.scheduleNextPowerUpSpawn();
    this.audio.stopTrack();
    this.updateTrackDescription();
    this.applySettingsToUi();
    this.syncGameplaySpeeds();
    this.render();
  }

  applySettingsToUi() {
    if (!this.settings) {
      return;
    }

    if (this.dom.ballSpeedInput) {
      this.dom.ballSpeedInput.value = String(this.settings.ballSpeed);
    }
    if (this.dom.ballSpeedValue) {
      this.dom.ballSpeedValue.textContent = `${this.settings.ballSpeed.toFixed(2)}x`;
    }
    if (this.dom.themeSelect) {
      this.dom.themeSelect.value = this.settings.themeId;
    }
    if (this.dom.trackSelect) {
      this.dom.trackSelect.value = this.settings.selectedTrackId;
    }
    if (this.dom.launcherSoundSelect) {
      this.dom.launcherSoundSelect.value = this.settings.launcherSoundId;
    }
    this.updateTrackDescription();

    if (!this.dom.categoryAssignments) {
      return;
    }

    const assignmentRows = [...this.dom.categoryAssignments.querySelectorAll("select")];
    assignmentRows.forEach((selectElement, index) => {
      const category = this.catalog.categories[index];
      const selectedSoundId =
        this.settings.categorySoundAssignments[category.id] || this.catalog.categoryById.get(category.id).defaultSoundId;
      selectElement.value = selectedSoundId;
    });
  }

  updateTrackDescription() {
    const track = this.catalog?.trackById?.get(this.settings?.selectedTrackId);
    if (this.dom.trackDescription) {
      this.dom.trackDescription.textContent = track ? track.description : "No track selected.";
    }
  }

  startLoop() {
    if (this.isLoopRunning) {
      return;
    }
    this.isLoopRunning = true;

    const frame = (timestamp) => {
      if (!this.lastFrameTime) {
        this.lastFrameTime = timestamp;
      }

      const deltaSeconds = Math.min((timestamp - this.lastFrameTime) / 1000, 0.05);
      this.lastFrameTime = timestamp;
      this.accumulator += deltaSeconds;

      while (this.accumulator >= FIXED_TIMESTEP) {
        this.update(FIXED_TIMESTEP);
        this.accumulator -= FIXED_TIMESTEP;
      }

      this.render();
      this.animationFrameId = window.requestAnimationFrame(frame);
    };

    this.animationFrameId = window.requestAnimationFrame(frame);
  }

  advanceTime(milliseconds) {
    const totalSeconds = milliseconds / 1000;
    let remaining = totalSeconds;
    while (remaining > 0) {
      const step = Math.min(FIXED_TIMESTEP, remaining);
      this.update(step);
      remaining -= step;
    }
    this.render();
  }

  update(deltaSeconds) {
    if (!this.state.currentLevel || ["loading", "error"].includes(this.state.mode)) {
      return;
    }

    this.updateEffectTimers(deltaSeconds);

    if (this.input.consumePress("KeyF")) {
      this.toggleFullscreen();
    }

    if (this.input.consumePress("KeyR")) {
      this.resetCurrentLevel();
      return;
    }

    if (this.input.consumePress("KeyN")) {
      const level = generateProceduralLevel(this.catalog);
      this.loadLevelObject(level);
      this.setStatus(`Generated a new field with seed ${level.metadata.seed}.`);
      return;
    }

    if (this.input.consumePress("KeyP")) {
      this.togglePause();
    }

    if (this.state.mode === "won" && this.input.consumePress("Enter")) {
      this.startNextGeneratedRound();
      return;
    }

    if (this.state.mode === "paused") {
      return;
    }

    if (["ready", "playing"].includes(this.state.mode)) {
      this.updatePowerUps(deltaSeconds);
    }

    this.updateLauncher(deltaSeconds);

    if (this.input.consumePress("Space")) {
      if (this.state.mode === "ready") {
        this.state.mode = "playing";
      }

      if (this.state.mode === "playing" && !this.state.activeBall && this.state.ballsRemaining > 0) {
        this.launchBall();
      } else if (this.state.mode === "won" || this.state.mode === "lost") {
        this.resetCurrentLevel();
        this.state.mode = "playing";
        this.launchBall();
      }
    }

    if (this.state.mode !== "playing" || !this.state.activeBall) {
      return;
    }

    this.updateBall(deltaSeconds);
  }

  updateLauncher(deltaSeconds) {
    const moveLeft = this.input.isDown("ArrowLeft", "KeyA");
    const moveRight = this.input.isDown("ArrowRight", "KeyD");
    const direction = Number(moveRight) - Number(moveLeft);
    this.state.launcher.x += direction * this.state.launcher.speed * deltaSeconds;
    this.state.launcher.x = clamp(
      this.state.launcher.x,
      this.state.fieldMetrics.field.x,
      this.state.fieldMetrics.field.right - this.state.launcher.width
    );
  }

  launchBall() {
    const launchDirection = normalizeVector(
      (this.input.isDown("ArrowRight", "KeyD") ? 1 : 0) - (this.input.isDown("ArrowLeft", "KeyA") ? 1 : 0),
      -2.2
    );
    const speed = BASE_BALL_SPEED * this.settings.ballSpeed;

    this.state.activeBall = {
      x: this.state.launcher.x + this.state.launcher.width / 2,
      y: this.state.launcher.y - 14,
      vx: launchDirection.x * speed,
      vy: launchDirection.y * speed,
      radius: 10
    };

    this.state.ballsRemaining -= 1;
    this.resetStreak();
    this.audio.playTrack(this.settings.selectedTrackId);
    this.setStatus("Ball launched.");
  }

  updateBall(deltaSeconds) {
    const ball = this.state.activeBall;
    const speed = BASE_BALL_SPEED * this.settings.ballSpeed;
    const passThroughObstacles = this.isObstaclePassThroughActive();

    ball.x += ball.vx * deltaSeconds;
    ball.y += ball.vy * deltaSeconds;

    const field = this.state.fieldMetrics.field;

    if (ball.x - ball.radius <= field.x) {
      ball.x = field.x + ball.radius;
      ball.vx = Math.abs(ball.vx);
    }
    if (ball.x + ball.radius >= field.right) {
      ball.x = field.right - ball.radius;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - ball.radius <= field.y) {
      ball.y = field.y + ball.radius;
      ball.vy = Math.abs(ball.vy);
    }

    const launcherRect = this.state.launcher;
    const launcherCollision = circleRectCollision(ball, launcherRect);
    if (launcherCollision && ball.vy > 0) {
      ball.y -= launcherCollision.penetration * launcherCollision.normalY;
      const relative = ((ball.x - launcherRect.x) / launcherRect.width - 0.5) * 2;
      const angle = relative * 1.02;
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.cos(angle) * speed;
      const banked = this.bankStreakScore();
      this.audio.playSound(this.settings.launcherSoundId || this.catalog.sounds[0]?.id);
      if (banked > 0) {
        this.setStatus(`Banked ${banked} streak points.`);
      }
    }

    let collidedWithRect = false;

    for (const obstacle of this.state.obstacles) {
      const collision = circleRectCollision(ball, obstacle.rect);
      if (!collision) {
        continue;
      }

      if (passThroughObstacles) {
        if ((obstacle.contactCooldown || 0) > 0) {
          continue;
        }

        obstacle.contactCooldown = 0.14;
        obstacle.hitAnimation.timer = obstacle.hitAnimation.duration;
        this.registerStreakCollision();
        this.audio.playObstaclePing();
        continue;
      }

      ball.x += collision.normalX * collision.penetration;
      ball.y += collision.normalY * collision.penetration;
      reflectVelocity(ball, collision.normalX, collision.normalY);
      obstacle.hitAnimation.timer = obstacle.hitAnimation.duration;
      this.registerStreakCollision();
      this.audio.playObstaclePing();
      collidedWithRect = true;
      break;
    }

    if (!collidedWithRect) {
      for (const brick of this.state.bricks) {
        if (brick.destroyed) {
          continue;
        }

        const collision = circleRectCollision(ball, brick.rect);
        if (!collision) {
          continue;
        }

        ball.x += collision.normalX * collision.penetration;
        ball.y += collision.normalY * collision.penetration;
        reflectVelocity(ball, collision.normalX, collision.normalY);

        this.registerStreakCollision();
        brick.hitsRemaining -= 1;
        this.state.brickHits += 1;
        this.awardScore(50);

        if (brick.hitsRemaining <= 0) {
          brick.destroyed = true;
          this.awardScore(50);
        }

        const soundId =
          this.settings.categorySoundAssignments[brick.categoryId] ||
          this.catalog.categoryById.get(brick.categoryId)?.defaultSoundId;
        this.audio.playSound(soundId);
        collidedWithRect = true;
        break;
      }
    }

    if (collidedWithRect) {
      const normalized = normalizeVector(ball.vx, ball.vy);
      ball.vx = normalized.x * speed;
      ball.vy = normalized.y * speed;
    }

    if (ball.y - ball.radius > field.bottom + 12) {
      this.state.activeBall = null;
      const lost = this.loseStreakScore();
      const expiredPowerUp = this.clearActivePowerUp();
      if (this.state.ballsRemaining <= 0) {
        this.state.mode = "lost";
        this.setStatus(
          lost > 0
            ? `${expiredPowerUp ? `${expiredPowerUp.name} faded out. ` : ""}Lost ${lost} streak points. ${
                this.isTouchLayout ? "Tap to relaunch or use Restart." : "Press Space or Restart to try again."
              }`
            : expiredPowerUp
              ? `${expiredPowerUp.name} faded out. ${
                  this.isTouchLayout ? "Tap to relaunch or use Restart." : "No balls left. Press Space or Restart to try again."
                }`
              : this.isTouchLayout
                ? "No balls left. Tap to relaunch or use Restart."
                : "No balls left. Press Space or Restart to try again."
        );
      } else {
        this.setStatus(
          lost > 0
            ? `${expiredPowerUp ? `${expiredPowerUp.name} faded out. ` : ""}Lost ${lost} streak points. ${this.getRetryPrompt()}`
            : expiredPowerUp
              ? `${expiredPowerUp.name} faded out. ${this.getRetryPrompt()}`
              : `Ball lost. ${this.getRetryPrompt()}`
        );
      }
    }

    if (this.state.bricks.every((brick) => brick.destroyed)) {
      this.state.activeBall = null;
      const banked = this.bankStreakScore();
      this.state.mode = "won";
      this.setStatus(
        banked > 0
          ? `All bricks cleared. Banked ${banked} streak points. Press Enter for the next round, or generate/restart.`
          : "All bricks cleared. Press Enter for the next round, or generate/restart."
      );
    }
  }

  toggleFullscreen() {
    if (!this.dom.gamePanel) {
      return;
    }

    if (this.document.fullscreenElement !== this.dom.gamePanel) {
      this.dom.gamePanel.requestFullscreen?.().catch(() => {});
    } else {
      this.document.exitFullscreen?.().catch(() => {});
    }
  }

  requestAutoFullscreen() {
    if (!this.shouldAutoFullscreen || !this.dom.gamePanel || this.document.fullscreenElement) {
      return;
    }

    this.shouldAutoFullscreen = false;
    window.requestAnimationFrame(() => {
      this.dom.gamePanel.requestFullscreen?.().catch(() => {});
    });
  }

  setStatus(message) {
    this.state.statusMessage = message;
    this.syncStatusPanel();
  }

  syncStatusPanel() {
    const levelName = this.state.currentLevel?.metadata?.name || "No level";
    if (this.dom.levelName) {
      this.dom.levelName.textContent = levelName;
    }
    if (this.dom.levelSource) {
      this.dom.levelSource.textContent = this.state.currentLevel?.metadata?.source || "-";
    }
    if (this.dom.modeLabel) {
      this.dom.modeLabel.textContent = this.state.mode;
    }
    if (this.dom.statusMessage) {
      this.dom.statusMessage.textContent = this.state.statusMessage;
    }
    if (this.dom.mobilePauseButton) {
      this.dom.mobilePauseButton.textContent = this.state.mode === "paused" ? "Resume" : "Pause";
    }
  }

  applyStartupSettings() {
    if (!this.startupState?.settings) {
      return;
    }

    const validThemeIds = new Set(THEMES.map((theme) => theme.id));
    this.settings = sanitizeImportedSettings(this.startupState.settings, this.catalog, validThemeIds);
  }

  async bootstrapLevel() {
    if (this.startupState?.level) {
      this.loadLevelObject(this.startupState.level);
      return;
    }

    await this.loadLevelFromPath(DEFAULT_LEVEL_PATH);
  }

  render() {
    if (!this.settings || !this.catalog) {
      return;
    }
    this.syncStatusPanel();
    const theme = this.themeById.get(this.settings.themeId) || THEMES[0];
    this.renderer.render({
      theme,
      state: this.state,
      catalog: this.catalog,
      settings: this.settings,
      fullscreenActive: this.isFullscreenActive,
      touchLayout: this.isTouchLayout
    });
  }

  renderGameToText() {
    const theme = this.themeById.get(this.settings?.themeId)?.name || "";
    const activePowerUpType = this.getActivePowerUpType();
    const bricks = this.state.bricks
      .filter((brick) => !brick.destroyed)
      .map((brick) => ({
        categoryId: brick.categoryId,
        hitsRemaining: brick.hitsRemaining,
        col: brick.col,
        row: brick.row
      }));

    const obstacles = this.state.obstacles.map((obstacle) => ({
      typeId: obstacle.typeId,
      col: obstacle.col,
      row: obstacle.row
    }));

    return JSON.stringify({
      coordinateSystem: {
        origin: "top-left",
        x: "increases right",
        y: "increases down",
        levelPlacement: "grid coordinates"
      },
      mode: this.state.mode,
      statusMessage: this.state.statusMessage,
      touchLayout: this.isTouchLayout,
      portraitMobile: this.isPortraitMobile,
      level: this.state.currentLevel?.metadata || null,
      ballsRemaining: this.state.ballsRemaining,
      score: this.state.score,
      streakScore: this.state.streakScore,
      streak: this.state.streak,
      scoreMultiplier: this.state.scoreMultiplier,
      launcher: {
        x: Number(this.state.launcher.x.toFixed(1)),
        y: Number(this.state.launcher.y.toFixed(1)),
        width: this.state.launcher.width
      },
      activeBall: this.state.activeBall
        ? {
            x: Number(this.state.activeBall.x.toFixed(1)),
            y: Number(this.state.activeBall.y.toFixed(1)),
            vx: Number(this.state.activeBall.vx.toFixed(1)),
            vy: Number(this.state.activeBall.vy.toFixed(1)),
            radius: this.state.activeBall.radius
          }
        : null,
      activePowerUp: activePowerUpType
        ? {
            id: activePowerUpType.id,
            name: activePowerUpType.name,
            effect: activePowerUpType.effect
          }
        : null,
      fallingPowerUps: this.state.fallingPowerUps.map((powerUp) => {
        const type = this.getPowerUpType(powerUp.typeId);
        return {
          id: powerUp.id,
          typeId: powerUp.typeId,
          name: type?.name || powerUp.typeId,
          x: Number(powerUp.x.toFixed(1)),
          y: Number(powerUp.y.toFixed(1))
        };
      }),
      nextPowerUpSpawnIn: Number.isFinite(this.state.nextPowerUpSpawnIn)
        ? Number(this.state.nextPowerUpSpawnIn.toFixed(1))
        : null,
      bricks,
      obstacles,
      settings: {
        ballSpeed: this.settings.ballSpeed,
        theme,
        selectedTrackId: this.settings.selectedTrackId,
        launcherSoundId: this.settings.launcherSoundId
      }
    });
  }
}
