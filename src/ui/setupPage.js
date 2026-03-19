import { DEFAULT_LEVEL_PATH, THEMES } from "../core/config.js";
import { createDefaultSettings } from "../core/state.js";
import { saveStartupState } from "../core/startupState.js";
import { fetchXmlDocument } from "../data/xmlLoader.js";
import { loadCatalog } from "../data/catalogLoader.js";
import { parseLevelDocument, sanitizeImportedSettings, validateLevel } from "../data/manifestParsers.js";
import { parseLevelXml, serializeLevel } from "../data/levelSerializer.js";
import { parseSettingsXml, serializeSettings } from "../data/settingsSerializer.js";
import { AudioManager } from "../engine/audioManager.js";
import { generateProceduralLevel } from "../gameplay/proceduralGenerator.js";

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
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

export class SetupPage {
  constructor(documentNode) {
    this.document = documentNode;
    this.audio = new AudioManager();
    this.catalog = null;
    this.settings = null;
    this.currentLevel = null;
    this.previewContext = null;
    this.themeById = new Map(THEMES.map((theme) => [theme.id, theme]));
  }

  async init() {
    this.cacheDom();
    this.bindUi();

    try {
      this.catalog = await loadCatalog();
      this.settings = createDefaultSettings(this.catalog);
      this.audio.preload(this.catalog);
      await this.loadDefaultLevel();
      this.populateUiOptions();
      this.applySettingsToUi();
      this.syncLevelSummary();
      this.renderPreview();
      this.setStatus("Dial in your setup, then hit Start.");
      this.dom.startButton.disabled = false;
    } catch (error) {
      console.error(error);
      this.setStatus(error.message);
    }
  }

  cacheDom() {
    this.dom = {
      startButton: this.document.getElementById("start-button"),
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
      setupPreviewCanvas: this.document.getElementById("setup-preview-canvas"),
      trackDescription: this.document.getElementById("track-description"),
      setupLevelName: this.document.getElementById("setup-level-name"),
      setupLevelSource: this.document.getElementById("setup-level-source"),
      setupStatus: this.document.getElementById("setup-status")
    };
  }

  bindUi() {
    this.dom.startButton.addEventListener("click", () => {
      if (!this.catalog || !this.currentLevel || !this.settings) {
        return;
      }

      this.audio.unlock();
      saveStartupState({
        settings: this.settings,
        level: this.currentLevel,
        autoFullscreen: true
      });
      window.location.href = "./play.html";
    });

    this.dom.generateButton.addEventListener("click", () => {
      if (!this.catalog) {
        return;
      }

      this.audio.unlock();
      this.currentLevel = generateProceduralLevel(this.catalog);
      validateLevel(this.currentLevel, this.catalog);
      this.syncLevelSummary();
      this.renderPreview();
      this.setStatus(`Generated a new field with seed ${this.currentLevel.metadata.seed}.`);
    });

    this.dom.exportLevelButton.addEventListener("click", () => {
      if (!this.currentLevel) {
        return;
      }
      downloadTextFile(`${this.currentLevel.id}.xml`, serializeLevel(this.currentLevel));
      this.setStatus("Exported the current field as XML.");
    });

    this.dom.levelImportInput.addEventListener("change", async () => {
      try {
        const xmlText = await readSelectedFile(this.dom.levelImportInput);
        if (!xmlText) {
          return;
        }
        const importedLevel = parseLevelXml(xmlText);
        importedLevel.metadata.source = "imported";
        validateLevel(importedLevel, this.catalog);
        this.currentLevel = importedLevel;
        this.syncLevelSummary();
        this.renderPreview();
        this.setStatus(`Imported level "${importedLevel.metadata.name}".`);
      } catch (error) {
        this.setStatus(`Level import failed: ${error.message}`);
      } finally {
        this.dom.levelImportInput.value = "";
      }
    });

    this.dom.exportSettingsButton.addEventListener("click", () => {
      if (!this.settings) {
        return;
      }
      downloadTextFile("settings.xml", serializeSettings(this.settings));
      this.setStatus("Exported current customization settings.");
    });

    this.dom.settingsImportInput.addEventListener("change", async () => {
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
        this.renderPreview();
        this.setStatus("Imported customization settings.");
      } catch (error) {
        this.setStatus(`Settings import failed: ${error.message}`);
      } finally {
        this.dom.settingsImportInput.value = "";
      }
    });

    this.dom.ballSpeedInput.addEventListener("input", () => {
      this.settings.ballSpeed = Number.parseFloat(this.dom.ballSpeedInput.value);
      this.applySettingsToUi();
      this.setStatus(`Ball speed set to ${this.settings.ballSpeed.toFixed(2)}x.`);
    });

    this.dom.themeSelect.addEventListener("change", () => {
      this.settings.themeId = this.dom.themeSelect.value;
      this.applySettingsToUi();
      this.renderPreview();
      this.setStatus(`Theme switched to ${this.themeById.get(this.settings.themeId)?.name || this.settings.themeId}.`);
    });

    this.dom.launcherSoundSelect.addEventListener("change", () => {
      this.settings.launcherSoundId = this.dom.launcherSoundSelect.value;
      this.setStatus("Launcher sound updated.");
    });

    this.dom.trackSelect.addEventListener("change", () => {
      this.settings.selectedTrackId = this.dom.trackSelect.value;
      this.updateTrackDescription();
      this.audio.playTrack(this.settings.selectedTrackId);
      this.setStatus("Jukebox selection updated.");
    });

    this.dom.playTrackButton.addEventListener("click", () => {
      this.audio.unlock();
      this.audio.playTrack(this.settings.selectedTrackId);
      this.setStatus("Playing jukebox loop.");
    });

    this.dom.stopTrackButton.addEventListener("click", () => {
      this.audio.stopTrack();
      this.setStatus("Stopped jukebox playback.");
    });
  }

  async loadDefaultLevel() {
    const documentNode = await fetchXmlDocument(DEFAULT_LEVEL_PATH);
    this.currentLevel = parseLevelDocument(documentNode);
    validateLevel(this.currentLevel, this.catalog);
  }

  populateUiOptions() {
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

      select.value = this.settings.categorySoundAssignments[category.id] || category.defaultSoundId;
      select.addEventListener("change", () => {
        this.settings.categorySoundAssignments[category.id] = select.value;
        this.setStatus(`Updated ${category.name} sound assignment.`);
      });

      wrapper.append(select);
      this.dom.categoryAssignments.append(wrapper);
    }
  }

  applySettingsToUi() {
    this.dom.ballSpeedInput.value = String(this.settings.ballSpeed);
    this.dom.ballSpeedValue.textContent = `${this.settings.ballSpeed.toFixed(2)}x`;
    this.dom.themeSelect.value = this.settings.themeId;
    this.dom.trackSelect.value = this.settings.selectedTrackId;
    this.dom.launcherSoundSelect.value = this.settings.launcherSoundId;
    this.updateTrackDescription();

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
    this.dom.trackDescription.textContent = track ? track.description : "No track selected.";
  }

  renderPreview() {
    if (!this.currentLevel || !this.catalog || !this.dom.setupPreviewCanvas) {
      return;
    }

    if (!this.previewContext) {
      this.previewContext = this.dom.setupPreviewCanvas.getContext("2d");
    }

    const context = this.previewContext;
    const canvas = this.dom.setupPreviewCanvas;
    const width = canvas.width;
    const height = canvas.height;
    const theme = this.themeById.get(this.settings?.themeId) || THEMES[0];

    const backgroundGradient = context.createLinearGradient(0, 0, width, height);
    backgroundGradient.addColorStop(0, theme.backgroundTop);
    backgroundGradient.addColorStop(1, theme.backgroundBottom);
    context.fillStyle = backgroundGradient;
    context.fillRect(0, 0, width, height);

    const field = {
      x: 24,
      y: 20,
      width: width - 48,
      height: height - 40
    };
    const fieldRight = field.x + field.width;
    const fieldBottom = field.y + field.height;

    roundedRect(context, field.x, field.y, field.width, field.height, 20);
    context.fillStyle = theme.fieldBase;
    context.fill();
    context.strokeStyle = theme.fieldGlow;
    context.lineWidth = 3;
    context.stroke();

    const columns = Math.max(1, this.currentLevel.metadata.gridColumns);
    const rows = Math.max(1, this.currentLevel.metadata.gridRows);
    const gridPaddingX = 28;
    const gridTop = field.y + 24;
    const gridBottom = fieldBottom - 56;
    const slotWidth = (field.width - gridPaddingX * 2) / columns;
    const slotHeight = (gridBottom - gridTop) / rows;
    const cellPadding = 2;

    context.save();
    context.strokeStyle = theme.grid;
    context.lineWidth = 1;

    for (let column = 0; column <= columns; column += 1) {
      const x = field.x + gridPaddingX + column * slotWidth;
      context.beginPath();
      context.moveTo(x, gridTop);
      context.lineTo(x, gridBottom);
      context.stroke();
    }

    for (let row = 0; row <= rows; row += 1) {
      const y = gridTop + row * slotHeight;
      context.beginPath();
      context.moveTo(field.x + gridPaddingX, y);
      context.lineTo(fieldRight - gridPaddingX, y);
      context.stroke();
    }
    context.restore();

    for (const brick of this.currentLevel.bricks) {
      const category = this.catalog.categoryById.get(brick.categoryId);
      if (!category) {
        continue;
      }

      const x = field.x + gridPaddingX + brick.col * slotWidth + cellPadding;
      const y = gridTop + brick.row * slotHeight + cellPadding;
      const brickWidth = slotWidth - cellPadding * 2;
      const brickHeight = slotHeight - cellPadding * 2;

      context.save();
      context.shadowColor = category.color;
      context.shadowBlur = 8;
      roundedRect(context, x, y, brickWidth, brickHeight, 7);
      context.fillStyle = category.color;
      context.fill();
      context.restore();

      context.save();
      roundedRect(context, x, y, brickWidth, brickHeight, 7);
      context.strokeStyle = "rgba(255,255,255,0.25)";
      context.lineWidth = 1.5;
      context.stroke();
      context.restore();
    }

    for (const obstacle of this.currentLevel.obstacles) {
      const type = this.catalog.obstacleTypeById.get(obstacle.typeId);
      if (!type) {
        continue;
      }

      const x = field.x + gridPaddingX + obstacle.col * slotWidth + cellPadding;
      const y = gridTop + obstacle.row * slotHeight + cellPadding;
      const obstacleWidth = slotWidth * type.widthUnits - cellPadding * 2;
      const obstacleHeight = slotHeight * type.heightUnits - cellPadding * 2;

      context.save();
      roundedRect(context, x, y, obstacleWidth, obstacleHeight, 10);
      context.fillStyle = type.color;
      context.fill();
      context.strokeStyle = "rgba(255,255,255,0.2)";
      context.lineWidth = 2;
      context.stroke();
      context.restore();
    }

    const launcherWidth = field.width * 0.17;
    const launcherHeight = 12;
    const launcherX = field.x + field.width / 2 - launcherWidth / 2;
    const launcherY = fieldBottom - 28;
    const launcherGradient = context.createLinearGradient(launcherX, launcherY, launcherX, launcherY + launcherHeight);
    launcherGradient.addColorStop(0, "#ffe374");
    launcherGradient.addColorStop(1, theme.launcher);

    roundedRect(context, launcherX, launcherY, launcherWidth, launcherHeight, 9);
    context.fillStyle = launcherGradient;
    context.fill();
    context.strokeStyle = theme.launcherEdge;
    context.lineWidth = 2;
    context.stroke();
  }

  syncLevelSummary() {
    if (!this.currentLevel) {
      return;
    }

    this.dom.setupLevelName.textContent = this.currentLevel.metadata.name;
    this.dom.setupLevelSource.textContent = this.currentLevel.metadata.source;
  }

  setStatus(message) {
    this.dom.setupStatus.textContent = message;
  }
}
