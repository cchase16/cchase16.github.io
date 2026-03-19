import { parseLevelDocument } from "./manifestParsers.js";
import { parseXmlString } from "./xmlLoader.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeLevel(level) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Level version="1.0" id="${escapeXml(level.id)}">`,
    "  <Metadata>",
    `    <Name>${escapeXml(level.metadata.name)}</Name>`,
    `    <Author>${escapeXml(level.metadata.author)}</Author>`,
    `    <Source>${escapeXml(level.metadata.source)}</Source>`,
    `    <GridColumns>${level.metadata.gridColumns}</GridColumns>`,
    `    <GridRows>${level.metadata.gridRows}</GridRows>`
  ];

  if (level.metadata.seed) {
    lines.push(`    <Seed>${escapeXml(level.metadata.seed)}</Seed>`);
  }

  lines.push("  </Metadata>", "  <Layout>");

  for (const brick of level.bricks) {
    lines.push(`    <Brick categoryId="${escapeXml(brick.categoryId)}" col="${brick.col}" row="${brick.row}" />`);
  }

  for (const obstacle of level.obstacles) {
    lines.push(`    <Obstacle typeId="${escapeXml(obstacle.typeId)}" col="${obstacle.col}" row="${obstacle.row}" />`);
  }

  lines.push("  </Layout>", "</Level>");
  return `${lines.join("\n")}\n`;
}

export function parseLevelXml(xmlText) {
  return parseLevelDocument(parseXmlString(xmlText));
}
