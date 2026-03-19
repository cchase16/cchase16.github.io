import { FIELD_BOUNDS, GRID_LAYOUT, HUD_LAYOUT } from "../core/config.js";

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
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
    const { theme, state, catalog, settings, fullscreenActive } = scene;

    const backgroundGradient = context.createLinearGradient(0, 0, width, height);
    backgroundGradient.addColorStop(0, theme.backgroundTop);
    backgroundGradient.addColorStop(1, theme.backgroundBottom);
    context.fillStyle = backgroundGradient;
    context.fillRect(0, 0, width, height);

    const halo = context.createRadialGradient(width * 0.22, height * 0.12, 50, width * 0.22, height * 0.12, 420);
    halo.addColorStop(0, "rgba(255,255,255,0.3)");
    halo.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, width, height);

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

    roundedRect(context, FIELD_BOUNDS.x, FIELD_BOUNDS.y, FIELD_BOUNDS.width, FIELD_BOUNDS.height, 28);
    context.fillStyle = theme.fieldBase;
    context.fill();
    context.shadowColor = theme.shadow;
    context.shadowBlur = 22;
    context.strokeStyle = theme.fieldGlow;
    context.lineWidth = 4;
    context.stroke();
    context.shadowBlur = 0;

    const laneY = FIELD_BOUNDS.bottom - 68;
    context.fillStyle = theme.lane;
    context.fillRect(FIELD_BOUNDS.x + 22, laneY, FIELD_BOUNDS.width - 44, 48);
    for (let stripeX = FIELD_BOUNDS.x + 22; stripeX < FIELD_BOUNDS.right - 44; stripeX += 44) {
      context.fillStyle = theme.laneStripe;
      context.fillRect(stripeX, laneY, 22, 48);
    }

    if (state.fieldMetrics) {
      this.drawGrid(context, state.fieldMetrics, theme);
      this.drawObstacles(context, state, catalog, theme);
      this.drawBricks(context, state, catalog, theme);
    }

    this.drawLauncher(context, state.launcher, state.activeBall, theme, state.mode, state.ballsRemaining);
    this.drawBall(context, state.activeBall, theme);
    context.restore();

    this.drawHud(context, state, theme, settings);
    this.drawMultiplierFlash(context, state, theme);
    this.drawOverlay(context, state, theme);
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
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 10);
      context.fillStyle = category.color;
      context.fill();
      context.strokeStyle = "rgba(255,255,255,0.18)";
      context.lineWidth = 2;
      context.stroke();

      const durability = brick.hitsRemaining / category.hitsToBreak;
      context.fillStyle = "rgba(255,255,255,0.18)";
      context.fillRect(rect.x + 12, rect.y + rect.height - 10, (rect.width - 24) * durability, 4);

      context.fillStyle = "rgba(20,20,30,0.55)";
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
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 16);
      context.fillStyle = type.color;
      context.fill();
      context.strokeStyle = "rgba(255,255,255,0.16)";
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
        context.strokeStyle = `rgba(255,255,255,${bounceProgress * 0.28})`;
        context.lineWidth = 5;
        roundedRect(
          context,
          rect.x - bounceStrength * 0.2,
          rect.y - bounceStrength * 0.15,
          rect.width + bounceStrength * 0.4,
          rect.height + bounceStrength * 0.3,
          20
        );
        context.stroke();
        context.restore();
      }
    }
  }

  drawLauncher(context, launcher, activeBall, theme, mode, ballsRemaining) {
    if (!launcher) {
      return;
    }

    roundedRect(context, launcher.x, launcher.y, launcher.width, launcher.height, 12);
    context.fillStyle = theme.launcher;
    context.fill();
    context.strokeStyle = theme.launcherEdge;
    context.lineWidth = 3;
    context.stroke();

    if (!activeBall && ballsRemaining > 0 && ["ready", "playing", "paused"].includes(mode)) {
      this.drawBall(
        context,
        {
          x: launcher.x + launcher.width / 2,
          y: launcher.y - 12,
          radius: 10
        },
        theme
      );
    }
  }

  drawBall(context, ball, theme) {
    if (!ball) {
      return;
    }

    const glow = context.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, ball.radius * 2.8);
    glow.addColorStop(0, theme.ballGlow);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(ball.x, ball.y, ball.radius * 2.8, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    context.fillStyle = theme.ball;
    context.fill();
  }

  drawHud(context, state, theme, settings) {
    context.save();
    context.textAlign = "left";
    context.fillStyle = theme.panel;
    roundedRect(context, HUD_LAYOUT.left, HUD_LAYOUT.top, 410, 170, 22);
    context.fill();

    context.fillStyle = theme.text;
    context.font = "700 18px Trebuchet MS";
    context.fillText("Musical Brick Buster", HUD_LAYOUT.left + 18, HUD_LAYOUT.top + 28);

    context.font = "16px Trebuchet MS";
    context.fillText(`Score: ${state.score}`, HUD_LAYOUT.left + 18, HUD_LAYOUT.top + 56);
    context.fillText(`Balls: ${state.ballsRemaining}`, HUD_LAYOUT.left + 18, HUD_LAYOUT.top + 82);
    context.fillText(`Streak: ${state.streak}`, HUD_LAYOUT.left + 18, HUD_LAYOUT.top + 108);
    context.fillText(`Streak Bank: ${state.streakScore}`, HUD_LAYOUT.left + 18, HUD_LAYOUT.top + 134);
    context.fillText(`Bricks Left: ${state.bricks.filter((brick) => !brick.destroyed).length}`, HUD_LAYOUT.left + 210, HUD_LAYOUT.top + 56);
    context.fillText(`Speed: ${Number(settings.ballSpeed).toFixed(2)}x`, HUD_LAYOUT.left + 210, HUD_LAYOUT.top + 82);
    context.fillText(`Multiplier: ${state.scoreMultiplier.toFixed(2)}x`, HUD_LAYOUT.left + 210, HUD_LAYOUT.top + 108);
    context.restore();
  }

  drawMultiplierFlash(context, state, theme) {
    if (!state.multiplierFlash || state.multiplierFlash.timer <= 0) {
      return;
    }

    const progress = state.multiplierFlash.timer / state.multiplierFlash.duration;
    const scale = 1 + (1 - progress) * 0.18;
    const alpha = Math.min(1, progress * 1.8);
    const centerX = this.width / 2;
    const centerY = 180;

    context.save();
    context.translate(centerX, centerY);
    context.scale(scale, scale);
    context.textAlign = "center";
    context.fillStyle = `rgba(16, 14, 28, ${0.5 * alpha})`;
    roundedRect(context, -250, -54, 500, 110, 28);
    context.fill();

    context.fillStyle = `rgba(255, 224, 133, ${alpha})`;
    context.font = "700 22px Trebuchet MS";
    context.fillText("Multiplier!", 0, -8);
    context.fillStyle = `rgba(255, 250, 236, ${alpha})`;
    context.font = "700 40px Trebuchet MS";
    context.fillText(state.multiplierFlash.label, 0, 34);
    context.restore();
  }

  drawOverlay(context, state, theme) {
    if (!["loading", "ready", "paused", "won", "lost", "error"].includes(state.mode)) {
      return;
    }

    const overlayWidth = 530;
    const overlayHeight = 150;
    const x = (this.width - overlayWidth) / 2;
    const y = 250;

    context.save();
    roundedRect(context, x, y, overlayWidth, overlayHeight, 24);
    context.fillStyle = "rgba(10, 13, 26, 0.78)";
    context.fill();

    context.fillStyle = theme.text;
    context.textAlign = "center";
    context.font = "700 34px Trebuchet MS";

    const titles = {
      loading: "Loading Set",
      ready: "Press Space To Launch",
      paused: "Paused",
      won: "Stage Cleared",
      lost: "Out Of Balls",
      error: "Setup Error"
    };

    context.fillText(titles[state.mode] || state.mode, x + overlayWidth / 2, y + 52);
    context.font = "18px Trebuchet MS";
    context.fillText(state.statusMessage, x + overlayWidth / 2, y + 92);
    context.fillStyle = theme.accent;
    context.fillText("Arrow Keys / A D to move", x + overlayWidth / 2, y + 124);
    context.restore();
  }
}
