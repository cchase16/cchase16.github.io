import { parseSettingsDocument } from "./manifestParsers.js";
import { parseXmlString } from "./xmlLoader.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeSettings(settings) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<GameSettings version="1.0">',
    "  <Gameplay>",
    `    <BallSpeed>${Number(settings.ballSpeed).toFixed(2)}</BallSpeed>`,
    `    <ThemeId>${escapeXml(settings.themeId)}</ThemeId>`,
    `    <SelectedTrackId>${escapeXml(settings.selectedTrackId)}</SelectedTrackId>`
  ];

  if (settings.launcherSoundId) {
    lines.push(`    <LauncherSoundId>${escapeXml(settings.launcherSoundId)}</LauncherSoundId>`);
  }

  lines.push("  </Gameplay>", "  <CategorySoundAssignments>");

  for (const [categoryId, soundId] of Object.entries(settings.categorySoundAssignments)) {
    lines.push(`    <Assignment categoryId="${escapeXml(categoryId)}" soundId="${escapeXml(soundId)}" />`);
  }

  lines.push("  </CategorySoundAssignments>", "</GameSettings>");
  return `${lines.join("\n")}\n`;
}

export function parseSettingsXml(xmlText) {
  return parseSettingsDocument(parseXmlString(xmlText));
}
