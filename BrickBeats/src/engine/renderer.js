import { FIELD_BOUNDS, GRID_LAYOUT } from "../core/config.js";

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawMusicNote(context, x, y, scale, color, rotation = 0) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);

  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";
  context.lineWidth = 6 * scale;

  context.beginPath();
  context.moveTo(0, -32 * scale);
  context.lineTo(0, 26 * scale);
  context.stroke();

  context.beginPath();
  context.ellipse(-14 * scale, 28 * scale, 13 * scale, 10 * scale, -0.28, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.moveTo(0, -32 * scale);
  context.quadraticCurveTo(18 * scale, -26 * scale, 20 * scale, -10 * scale);
  context.stroke();

  context.restore();
}

function drawGlowCircle(context, x, y, radius, color, alpha) {
  const glow = context.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`);
  glow.addColorStop(1, `${color}00`);
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function hexToRgba(hexColor, alpha) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
    this.powerUpNoteSprite = new Image();
    this.powerUpNoteSprite.src = "assets/Sprites/GreenMusicNote.png";
  }

  computeFieldMetrics(level) {
    const field = {
      ...FIELD_BOUNDS,
      right: FIELD_BOUNDS.x + FIELD_BOUNDS.width,
      bottom: FIELD_BOUNDS.y + FIELD_BOUNDS.height
    };

    const columns = Math.max(1, level.metadata.gridColumns);
    const rows = Math.max(1, level.metadata.gridRows);
    const slotWidth = (field.width - GRID_LAYOUT.leftInset * 2) / columns;
    const slotHeight = GRID_LAYOUT.rowHeight;

    return {
      field,
      grid: {
        columns,
        rows,
        left: field.x + GRID_LAYOUT.leftInset,
        top: field.y + GRID_LAYOUT.topInset,
        slotWidth,
        slotHeight,
        padding: GRID_LAYOUT.cellPadding
      }
    };
  }

  computeRectFromPlacement(item, metrics, widthUnits = 1, heightUnits = 1) {
    const { grid } = metrics;
    const x = grid.left + item.col * grid.slotWidth + grid.padding;
    const y = grid.top + item.row * grid.slotHeight + grid.padding;
    const width = grid.slotWidth * widthUnits - grid.padding * 2;
    const height = grid.slotHeight * heightUnits - grid.padding * 2;

    return { x, y, width, height };
  }

  render(scene) {
    const { context, width, height } = this;
    const { theme, state, catalog, settings, fullscreenActive, touchLayout } = scene;
    const activePowerUpType = state.activePowerUp ? catalog.powerUpTypeById.get(state.activePowerUp.typeId) : null;

    this.drawBackground(context, width, height, theme);
    this.drawBackdropDecorations(context, width, height);

    context.save();
    if (fullscreenActive) {
      const targetFieldWidth = width * 0.92;
      const targetFieldHeight = height * 0.92;
      const scale = Math.min(targetFieldWidth / FIELD_BOUNDS.width, targetFieldHeight / FIELD_BOUNDS.height);
      const fieldCenterX = FIELD_BOUNDS.x + FIELD_BOUNDS.width / 2;
      const fieldCenterY = FIELD_BOUNDS.y + FIELD_BOUNDS.height / 2;
      const translateX = width / 2 - fieldCenterX * scale;
      const translateY = height / 2 - fieldCenterY * scale;
      context.setTransform(scale, 0, 0, scale, translateX, translateY);
    }

    this.drawStage(context, theme);

    if (state.fieldMetrics) {
      this.drawGrid(context, state.fieldMetrics, theme);
      this.drawObstacles(context, state, catalog, theme);
      this.drawBricks(context, state, catalog, theme);
      this.drawPowerUps(context, state, catalog);
    }

    this.drawStaff(context);
    this.drawControlBand(context, touchLayout);
    this.drawLauncher(
      context,
      state.launcher,
      state.activeBall,
      theme,
      state.mode,
      state.ballsRemaining,
      activePowerUpType?.glowColor || null
    );
    this.drawBall(context, state.activeBall, theme, activePowerUpType?.glowColor || null);
    context.restore();

    this.drawHud(context, state, settings, fullscreenActive);
    this.drawMultiplierFlash(context, state);
    this.drawOverlay(context, state, theme, touchLayout);
  }

  drawBackground(context, width, height, theme) {
    const backgroundGradient = context.createLinearGradient(0, 0, width, height);
    backgroundGradient.addColorStop(0, theme.backgroundTop);
    backgroundGradient.addColorStop(1, theme.backgroundBottom);
    context.fillStyle = backgroundGradient;
    context.fillRect(0, 0, width, height);

    const leftGlow = context.createRadialGradient(width * 0.18, height * 0.16, 10, width * 0.18, height * 0.16, 360);
    leftGlow.addColorStop(0, "rgba(0, 225, 255, 0.2)");
    leftGlow.addColorStop(1, "rgba(0, 225, 255, 0)");
    context.fillStyle = leftGlow;
    context.fillRect(0, 0, width, height);

    const rightGlow = context.createRadialGradient(width * 0.84, height * 0.22, 10, width * 0.84, height * 0.22, 420);
    rightGlow.addColorStop(0, "rgba(255, 170, 65, 0.16)");
    rightGlow.addColorStop(1, "rgba(255, 170, 65, 0)");
    context.fillStyle = rightGlow;
    context.fillRect(0, 0, width, height);

    const vignette = context.createRadialGradient(width / 2, height / 2, height * 0.15, width / 2, height / 2, height * 0.82);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }

  drawBackdropDecorations(context, width, height) {
    context.save();
    context.strokeStyle = "rgba(69, 124, 255, 0.12)";
    context.lineWidth = 8;
    for (let i = 0; i < 7; i += 1) {
      const baseY = height - 150 - i * 18;
      context.beginPath();
      context.moveTo(110, baseY);
      context.bezierCurveTo(width * 0.28, baseY - 34, width * 0.54, baseY + 36, width - 120, baseY - 16);
      context.stroke();
    }

    context.fillStyle = "rgba(47, 130, 255, 0.18)";
    for (let index = 0; index < 9; index += 1) {
      const barWidth = 18;
      const gap = 9;
      const x = 24 + index * (barWidth + gap);
      const barHeight = 18 + (index % 4) * 12;
      context.fillRect(x, height - 220 - barHeight, barWidth, barHeight);
      const mirroredX = width - 24 - barWidth - index * (barWidth + gap);
      context.fillRect(mirroredX, height - 220 - barHeight, barWidth, barHeight);
    }

    drawMusicNote(context, 58, 168, 1.15, "rgba(39, 209, 255, 0.75)", -0.08);
    drawMusicNote(context, width - 70, 140, 1.05, "rgba(39, 209, 255, 0.75)", 0.12);
    drawMusicNote(context, 88, height - 192, 0.98, "rgba(255, 161, 74, 0.58)", 0.1);
    drawMusicNote(context, width - 62, height - 126, 1.12, "rgba(255, 202, 77, 0.84)", -0.12);
    context.restore();
  }

  drawStage(context, theme) {
    const fieldRight = FIELD_BOUNDS.x + FIELD_BOUNDS.width;
    const fieldBottom = FIELD_BOUNDS.y + FIELD_BOUNDS.height;
    const borderGradient = context.createLinearGradient(FIELD_BOUNDS.x, FIELD_BOUNDS.y, fieldRight, fieldBottom);
    borderGradient.addColorStop(0, "#2ce6ff");
    borderGradient.addColorStop(0.45, "#47d0ff");
    borderGradient.addColorStop(0.72, "#ff7b9e");
    borderGradient.addColorStop(1, "#ffcb49");

    roundedRect(context, FIELD_BOUNDS.x, FIELD_BOUNDS.y, FIELD_BOUNDS.width, FIELD_BOUNDS.height, 28);
    context.fillStyle = theme.fieldBase;
    context.fill();

    context.save();
    context.shadowColor = "rgba(49, 227, 255, 0.38)";
    context.shadowBlur = 24;
    context.strokeStyle = borderGradient;
    context.lineWidth = 4;
    context.stroke();
    context.restore();

    context.save();
    roundedRect(context, FIELD_BOUNDS.x + 12, FIELD_BOUNDS.y + 12, FIELD_BOUNDS.width - 24, FIELD_BOUNDS.height - 24, 24);
    context.strokeStyle = "rgba(84, 124, 255, 0.18)";
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();

    const topBeam = context.createLinearGradient(FIELD_BOUNDS.x + 160, FIELD_BOUNDS.y, fieldRight - 160, FIELD_BOUNDS.y);
    topBeam.addColorStop(0, "rgba(44, 230, 255, 0)");
    topBeam.addColorStop(0.2, "rgba(44, 230, 255, 0.55)");
    topBeam.addColorStop(0.8, "rgba(255, 202, 73, 0.55)");
    topBeam.addColorStop(1, "rgba(255, 202, 73, 0)");
    context.strokeStyle = topBeam;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(FIELD_BOUNDS.x + 120, FIELD_BOUNDS.y + 2);
    context.lineTo(fieldRight - 120, FIELD_BOUNDS.y + 2);
    context.stroke();
  }

  drawGrid(context, metrics, theme) {
    context.save();
    context.strokeStyle = theme.grid;
    context.lineWidth = 1;

    for (let column = 0; column <= metrics.grid.columns; column += 1) {
      const x = metrics.grid.left + column * metrics.grid.slotWidth;
      context.beginPath();
      context.moveTo(x, metrics.grid.top);
      context.lineTo(x, metrics.grid.top + metrics.grid.rows * metrics.grid.slotHeight);
      context.stroke();
    }

    for (let row = 0; row <= metrics.grid.rows; row += 1) {
      const y = metrics.grid.top + row * metrics.grid.slotHeight;
      context.beginPath();
      context.moveTo(metrics.grid.left, y);
      context.lineTo(metrics.grid.left + metrics.grid.columns * metrics.grid.slotWidth, y);
      context.stroke();
    }

    context.restore();
  }

  drawBricks(context, state, catalog) {
    for (const brick of state.bricks) {
      if (brick.destroyed) {
        continue;
      }

      const category = catalog.categoryById.get(brick.categoryId);
      const rect = brick.rect;

      context.save();
      context.shadowColor = category.color;
      context.shadowBlur = 12;
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 10);
      context.fillStyle = category.color;
      context.fill();
      context.restore();

      context.save();
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 10);
      context.strokeStyle = "rgba(255,255,255,0.38)";
      context.lineWidth = 2;
      context.stroke();

      const highlight = context.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
      highlight.addColorStop(0, "rgba(255,255,255,0.28)");
      highlight.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = highlight;
      roundedRect(context, rect.x + 2, rect.y + 2, rect.width - 4, rect.height * 0.46, 8);
      context.fill();

      const durability = brick.hitsRemaining / category.hitsToBreak;
      context.fillStyle = "rgba(255,255,255,0.18)";
      context.fillRect(rect.x + 12, rect.y + rect.height - 10, (rect.width - 24) * durability, 4);

      context.fillStyle = "rgba(15, 19, 36, 0.62)";
      context.font = "bold 14px Trebuchet MS";
      context.textAlign = "center";
      context.fillText(`${brick.hitsRemaining}`, rect.x + rect.width / 2, rect.y + rect.height / 2 + 5);
      context.restore();
    }
  }

  drawObstacles(context, state, catalog, theme) {
    for (const obstacle of state.obstacles) {
      const type = catalog.obstacleTypeById.get(obstacle.typeId);
      const rect = obstacle.rect;
      const bounceProgress = obstacle.hitAnimation?.timer > 0
        ? obstacle.hitAnimation.timer / obstacle.hitAnimation.duration
        : 0;
      const phase = (1 - bounceProgress) * Math.PI * 6;
      const envelope = bounceProgress;
      const bounceStrength = Math.sin(phase) * envelope * 8;
      const scaleX = 1 + bounceStrength * 0.004;
      const scaleY = 1 - bounceStrength * 0.0035;
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;

      context.save();
      context.translate(centerX, centerY);
      context.scale(scaleX, scaleY);
      context.translate(-centerX, -centerY);

      context.shadowColor = "rgba(72, 235, 255, 0.44)";
      context.shadowBlur = 18;
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 16);
      context.fillStyle = type.color;
      context.fill();
      context.restore();

      context.save();
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 16);
      context.strokeStyle = "rgba(255,255,255,0.42)";
      context.lineWidth = 3;
      context.stroke();

      context.save();
      context.beginPath();
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 16);
      context.clip();
      context.strokeStyle = theme.obstacleStripe;
      context.lineWidth = 4;
      for (let offset = -rect.height; offset < rect.width + rect.height; offset += 18) {
        context.beginPath();
        context.moveTo(rect.x + offset, rect.y + rect.height);
        context.lineTo(rect.x + offset + rect.height, rect.y);
        context.stroke();
      }
      context.restore();
      context.restore();

      if (bounceProgress > 0) {
        context.save();
        context.strokeStyle = `rgba(140, 243, 255, ${bounceProgress * 0.42})`;
        context.lineWidth = 5;
        roundedRect(
          context,
          rect.x - bounceStrength * 0.24,
          rect.y - bounceStrength * 0.18,
          rect.width + bounceStrength * 0.48,
          rect.height + bounceStrength * 0.36,
          20
        );
        context.stroke();
        context.restore();
      }
    }
  }

  drawStaff(context) {
    const fieldRight = FIELD_BOUNDS.x + FIELD_BOUNDS.width;
    const fieldBottom = FIELD_BOUNDS.y + FIELD_BOUNDS.height;
    context.save();
    context.strokeStyle = "rgba(79, 215, 255, 0.16)";
    context.lineWidth = 4;

    for (let line = 0; line < 5; line += 1) {
      const y = fieldBottom - 168 + line * 18;
      context.beginPath();
      context.moveTo(FIELD_BOUNDS.x + 84, y);
      context.bezierCurveTo(
        FIELD_BOUNDS.x + 310,
        y - 44,
        FIELD_BOUNDS.x + 740,
        y + 40,
        fieldRight - 98,
        y - 12
      );
      context.stroke();
    }

    drawMusicNote(context, FIELD_BOUNDS.x + 196, fieldBottom - 96, 0.64, "rgba(80, 215, 255, 0.18)", -0.1);
    drawMusicNote(context, FIELD_BOUNDS.x + 470, fieldBottom - 126, 0.58, "rgba(80, 215, 255, 0.16)", 0.06);
    drawMusicNote(context, FIELD_BOUNDS.x + 790, fieldBottom - 106, 0.7, "rgba(80, 215, 255, 0.16)", 0.12);
    context.restore();
  }

  drawPowerUps(context, state, catalog) {
    for (const powerUp of state.fallingPowerUps || []) {
      const type = catalog.powerUpTypeById.get(powerUp.typeId);
      if (!type) {
        continue;
      }

      const pulse = 0.78 + Math.sin(powerUp.glowPulse || 0) * 0.16;
      drawGlowCircle(context, powerUp.x, powerUp.y + 4, 44, type.glowColor, 0.18 * pulse);
      drawGlowCircle(context, powerUp.x, powerUp.y + 4, 24, type.glowColor, 0.28 * pulse);

      context.save();
      context.shadowColor = hexToRgba(type.glowColor, 0.86);
      context.shadowBlur = 18;
      context.translate(powerUp.x, powerUp.y);
      context.rotate(powerUp.rotation || 0);

      if (this.powerUpNoteSprite.complete && this.powerUpNoteSprite.naturalWidth > 0) {
        const spriteSize = 52;
        context.drawImage(this.powerUpNoteSprite, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
      } else {
        drawMusicNote(context, 0, 0, 0.8, type.noteColor, 0);
      }
      context.restore();
    }
  }

  drawLauncher(context, launcher, activeBall, theme, mode, ballsRemaining, parkedBallGlowColor = null) {
    if (!launcher) {
      return;
    }

    const launcherGradient = context.createLinearGradient(launcher.x, launcher.y, launcher.x, launcher.y + launcher.height);
    launcherGradient.addColorStop(0, "#ffe374");
    launcherGradient.addColorStop(1, theme.launcher);

    context.save();
    context.shadowColor = "rgba(255, 211, 79, 0.34)";
    context.shadowBlur = 18;
    roundedRect(context, launcher.x, launcher.y, launcher.width, launcher.height, 12);
    context.fillStyle = launcherGradient;
    context.fill();
    context.restore();

    context.save();
    roundedRect(context, launcher.x, launcher.y, launcher.width, launcher.height, 12);
    context.strokeStyle = theme.launcherEdge;
    context.lineWidth = 3;
    context.stroke();

    roundedRect(context, launcher.x + 12, launcher.y + 4, launcher.width - 24, launcher.height * 0.42, 10);
    context.fillStyle = "rgba(255, 255, 255, 0.24)";
    context.fill();
    context.restore();

    if (!activeBall && ballsRemaining > 0 && ["ready", "playing", "paused"].includes(mode)) {
      this.drawBall(
        context,
        {
          x: launcher.x + launcher.width / 2,
          y: launcher.y - 12,
          radius: 10
        },
        theme,
        parkedBallGlowColor
      );
    }
  }

  drawBall(context, ball, theme, powerGlowColor = null) {
    if (!ball) {
      return;
    }

    const glow = context.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, ball.radius * 3.3);
    glow.addColorStop(0, "rgba(255,255,255,0.98)");
    glow.addColorStop(0.3, powerGlowColor ? hexToRgba(powerGlowColor, 0.9) : theme.ballGlow);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(ball.x, ball.y, ball.radius * 3.3, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    context.fillStyle = theme.ball;
    context.fill();

    if (powerGlowColor) {
      context.beginPath();
      context.arc(ball.x, ball.y, ball.radius + 1.2, 0, Math.PI * 2);
      context.strokeStyle = hexToRgba(powerGlowColor, 0.85);
      context.lineWidth = 2.4;
      context.stroke();
    }

    context.beginPath();
    context.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.35, ball.radius * 0.32, 0, Math.PI * 2);
    context.fillStyle = "rgba(255,255,255,0.8)";
    context.fill();
  }

  drawHud(context, state, settings, fullscreenActive) {
    const stats = [
      { label: "Score", value: `${state.score}`, color: "#2fe0ff" },
      { label: "Bricks Left", value: `${state.bricks.filter((brick) => !brick.destroyed).length}`, color: "#50e28e" },
      { label: "Speed", value: `${Number(settings.ballSpeed).toFixed(2)}x`, color: "#56b1ff" },
      { label: "Multiplier", value: `${state.scoreMultiplier.toFixed(2)}x`, color: "#ff9361" }
    ];
    const width = fullscreenActive ? 200 : 220;
    const gap = 18;
    const startX = (this.width - (stats.length * width + (stats.length - 1) * gap)) / 2;
    const top = fullscreenActive ? 14 : 18;

    context.save();
    context.textAlign = "left";

    stats.forEach((stat, index) => {
      const x = startX + index * (width + gap);
      this.drawStatCapsule(context, x, top, width, 52, stat);
    });

    context.fillStyle = "rgba(234, 239, 255, 0.84)";
    context.textAlign = "center";
    context.font = fullscreenActive ? "600 16px Trebuchet MS" : "600 18px Trebuchet MS";
    context.fillText(
      `Balls ${state.ballsRemaining}   |   Streak ${state.streak}   |   Bank ${state.streakScore}`,
      this.width / 2,
      fullscreenActive ? 90 : 102
    );
    context.restore();
  }

  drawStatCapsule(context, x, y, width, height, stat) {
    const capsuleGradient = context.createLinearGradient(x, y, x + width, y + height);
    capsuleGradient.addColorStop(0, "rgba(22, 18, 54, 0.94)");
    capsuleGradient.addColorStop(1, "rgba(13, 15, 43, 0.88)");

    context.save();
    context.shadowColor = `${stat.color}66`;
    context.shadowBlur = 14;
    roundedRect(context, x, y, width, height, 24);
    context.fillStyle = capsuleGradient;
    context.fill();
    context.restore();

    context.save();
    roundedRect(context, x, y, width, height, 24);
    context.strokeStyle = "rgba(255, 255, 255, 0.18)";
    context.lineWidth = 1.5;
    context.stroke();
    drawGlowCircle(context, x + 28, y + height / 2, 14, stat.color.replace("#", "#"), 0.24);
    context.beginPath();
    context.arc(x + 28, y + height / 2, 8, 0, Math.PI * 2);
    context.fillStyle = stat.color;
    context.fill();

    context.fillStyle = "#f6f2ff";
    context.font = "700 15px Trebuchet MS";
    context.fillText(`${stat.label}: ${stat.value}`, x + 48, y + 32);
    context.restore();
  }

  drawControlBand(context, touchLayout) {
    const fieldBottom = FIELD_BOUNDS.y + FIELD_BOUNDS.height;
    const bandWidth = touchLayout ? 500 : 360;
    const bandHeight = touchLayout ? 94 : 64;
    const bandX = FIELD_BOUNDS.x + 44;
    const bandY = fieldBottom - (touchLayout ? 118 : 92);
    const titleX = bandX + bandWidth / 2;
    const title = "Brick Beats";

    const bandGradient = context.createLinearGradient(bandX, bandY, bandX + bandWidth, bandY + bandHeight);
    bandGradient.addColorStop(0, "rgba(14, 24, 63, 0.74)");
    bandGradient.addColorStop(0.52, "rgba(18, 15, 55, 0.86)");
    bandGradient.addColorStop(1, "rgba(31, 21, 62, 0.76)");

    const titleGradient = context.createLinearGradient(titleX - 180, bandY, titleX + 180, bandY + bandHeight);
    titleGradient.addColorStop(0, "#3ddfff");
    titleGradient.addColorStop(0.48, "#ff4f9f");
    titleGradient.addColorStop(1, "#ffb53c");

    context.save();
    context.shadowColor = touchLayout ? "rgba(61, 223, 255, 0.22)" : "rgba(255, 110, 197, 0.18)";
    context.shadowBlur = 20;
    roundedRect(context, bandX, bandY, bandWidth, bandHeight, 28);
    context.fillStyle = bandGradient;
    context.fill();
    context.restore();

    context.save();
    roundedRect(context, bandX, bandY, bandWidth, bandHeight, 28);
    context.strokeStyle = touchLayout ? "rgba(61, 223, 255, 0.32)" : "rgba(255, 203, 74, 0.22)";
    context.lineWidth = 2;
    context.stroke();

    context.textAlign = "center";
    if (touchLayout) {
      context.font = "700 14px Trebuchet MS";
      context.fillStyle = "rgba(110, 240, 255, 0.95)";
      context.fillText("SWIPE HERE TO MOVE  •  TAP TO LAUNCH", titleX, bandY + 22);
    }

    context.font = `900 ${touchLayout ? 50 : 56}px Arial Black, Trebuchet MS, sans-serif`;
    context.fillStyle = "rgba(52, 13, 103, 0.92)";
    context.fillText(title, titleX + 4, touchLayout ? bandY + 62 : bandY + 48);

    context.lineWidth = 6;
    context.strokeStyle = "rgba(255, 246, 255, 0.48)";
    context.strokeText(title, titleX, touchLayout ? bandY + 56 : bandY + 42);

    context.fillStyle = titleGradient;
    context.shadowColor = "rgba(255, 110, 197, 0.32)";
    context.shadowBlur = 18;
    context.fillText(title, titleX, touchLayout ? bandY + 56 : bandY + 42);
    context.restore();
  }

  drawMultiplierFlash(context, state) {
    if (!state.multiplierFlash || state.multiplierFlash.timer <= 0) {
      return;
    }

    const progress = state.multiplierFlash.timer / state.multiplierFlash.duration;
    const scale = 1 + (1 - progress) * 0.18;
    const alpha = Math.min(1, progress * 1.8);
    const centerX = this.width / 2;
    const centerY = 210;

    context.save();
    context.translate(centerX, centerY);
    context.scale(scale, scale);
    context.textAlign = "center";
    context.fillStyle = `rgba(10, 8, 28, ${0.6 * alpha})`;
    roundedRect(context, -250, -54, 500, 110, 28);
    context.fill();

    context.fillStyle = `rgba(255, 206, 92, ${alpha})`;
    context.font = "700 22px Trebuchet MS";
    context.fillText("Multiplier!", 0, -8);
    context.fillStyle = `rgba(255, 246, 252, ${alpha})`;
    context.font = "700 40px Trebuchet MS";
    context.fillText(state.multiplierFlash.label, 0, 34);
    context.restore();
  }

  drawOverlay(context, state, theme, touchLayout) {
    if (!["loading", "ready", "paused", "won", "lost", "error"].includes(state.mode)) {
      return;
    }

    const overlayWidth = 560;
    const overlayHeight = 156;
    const x = (this.width - overlayWidth) / 2;
    const y = 250;

    context.save();
    roundedRect(context, x, y, overlayWidth, overlayHeight, 28);
    context.fillStyle = "rgba(9, 12, 31, 0.8)";
    context.fill();
    context.strokeStyle = "rgba(74, 222, 255, 0.34)";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = theme.text;
    context.textAlign = "center";
    context.font = "700 34px Trebuchet MS";

    const titles = {
      loading: "Loading Set",
      ready: "Ready To Launch",
      paused: "Paused",
      won: "Stage Cleared",
      lost: "Out Of Balls",
      error: "Setup Error"
    };

    context.fillText(titles[state.mode] || state.mode, x + overlayWidth / 2, y + 54);
    context.font = "18px Trebuchet MS";
    context.fillText(state.statusMessage, x + overlayWidth / 2, y + 96);
    context.fillStyle = "#ffb85c";
    context.fillText(
      touchLayout ? "Swipe in the Brick Beats strip, tap to launch" : "Arrow Keys / A D to move",
      x + overlayWidth / 2,
      y + 128
    );
    context.restore();
  }
}
